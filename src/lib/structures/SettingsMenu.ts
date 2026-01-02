import {
	getConfigurableGroups,
	isSchemaGroup,
	readSettings,
	remove,
	reset,
	SchemaGroup,
	SchemaKey,
	set,
	writeSettingsTransaction
} from '#lib/database/settings';
import { getT } from '#lib/i18n';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { LongLivingInteractionCollector } from '#lib/util/LongLivingInteractionCollector';
import { WolfArgs, type WolfCommand, type WolfSubcommand } from '#lib/structures';
import { floatPromise, minutes, stringifyError } from '#utils/common';
import { ZeroWidthSpace } from '#utils/constants';
import { getColor, pickRandom } from '#utils/util';
import {
	ButtonBuilder,
	ChannelSelectMenuBuilder,
	ContainerBuilder,
	LabelBuilder,
	ModalBuilder,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder
} from '@discordjs/builders';
import { container, type MessageCommand } from '@sapphire/framework';
import { filter, partition } from '@sapphire/iterator-utilities';
import type { TFunction } from '@sapphire/plugin-i18next';
import {
	ButtonStyle,
	ChannelType,
	DiscordAPIError,
	MessageFlags,
	RESTJSONErrorCodes,
	TextInputStyle,
	type Message,
	type MessageComponentInteraction
} from 'discord.js';

const TIMEOUT = minutes(15);

const CustomIds = {
	// Navigation
	SELECT: 'conf-select',
	BACK: 'conf-back',
	STOP: 'conf-stop',

	// Actions
	SET: 'conf-set',
	REMOVE: 'conf-remove',
	RESET: 'conf-reset',
	UNDO: 'conf-undo',

	// Input Mode
	CANCEL: 'conf-cancel',
	INPUT_BOOL_TRUE: 'conf-input-bool-true',
	INPUT_BOOL_FALSE: 'conf-input-bool-false',
	INPUT_ROLE: 'conf-input-role',
	INPUT_CHANNEL: 'conf-input-channel',
	INPUT_REMOVE: 'conf-input-remove',
	INPUT_MODAL: 'conf-input-modal'
} as const;

const enum UpdateType {
	Set,
	Remove,
	Reset,
	Replace
}

export class SettingsMenu {
	private readonly interaction: WolfSubcommand.Interaction;
	private t: TFunction;
	private schema: SchemaKey | SchemaGroup;
	private collector: LongLivingInteractionCollector | null = null;
	private errorMessage: string | null = null;
	private response: Message | null = null;
	private oldValue: unknown = undefined;
	private inputMode = false;
	private inputType: UpdateType = UpdateType.Set;

	public constructor(message: WolfSubcommand.Interaction, language: TFunction) {
		this.interaction = message;
		this.t = language;
		this.schema = getConfigurableGroups();
	}

	public get client() {
		return container.client;
	}

	private get updatedValue(): boolean {
		return this.oldValue !== undefined;
	}

	public async init(context: WolfCommand.RunContext): Promise<void> {
		// Defer the interaction to prevent timeout
		await this.interaction.deferReply();

		// Show initial loading state
		const loadingMessages = this.t(LanguageKeys.System.Loading);
		const loadingContainer = new ContainerBuilder()
			.setAccentColor(0x5865f2)
			.addTextDisplayComponents((textDisplay) =>
				textDisplay.setContent(pickRandom(Array.isArray(loadingMessages) ? loadingMessages : [loadingMessages]))
			);

		this.response = await this.interaction.editReply({
			components: [loadingContainer],
			flags: [MessageFlags.IsComponentsV2]
		});

		// Render the actual menu
		await this._renderResponse();

		this.collector = new LongLivingInteractionCollector();
		this.collector.setListener((interaction) => this.onInteraction(interaction, context));
		this.collector.setEndListener(() => this.stop());
		this.collector.setTime(TIMEOUT);
	}

	private async render() {
		if (this.inputMode) {
			return this.renderInput();
		}

		const description = isSchemaGroup(this.schema) ? this.renderGroup(this.schema) : await this.renderKey(this.schema);
		const { parent } = this.schema;

		const container = new ContainerBuilder().setAccentColor(getColor(this.interaction));

		// Add main content as TextDisplay
		container.addTextDisplayComponents((textDisplay) => textDisplay.setContent(description.concat(ZeroWidthSpace).join('\n')));

		// Select Menu Row
		if (isSchemaGroup(this.schema)) {
			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId(CustomIds.SELECT)
				.setPlaceholder(this.t(LanguageKeys.Commands.Conf.MenuRenderSelect));

			const options = [];
			// Collect folders
			for (const value of this.schema.values()) {
				if (value.dashboardOnly) continue;
				if (isSchemaGroup(value)) {
					options.push({
						label: value.name,
						value: value.key,
						emoji: { name: '📁' },
						description: this.t(LanguageKeys.Commands.Conf.MenuRenderAtFolder, { path: value.name }).substring(0, 100)
					});
				}
			}
			// Collect keys
			for (const value of this.schema.values()) {
				if (value.dashboardOnly) continue;
				if (!isSchemaGroup(value)) {
					options.push({
						label: value.name,
						value: value.key,
						emoji: { name: '⚙️' },
						description: this.t(LanguageKeys.Commands.Conf.MenuRenderAtPiece, { path: value.name }).substring(0, 100)
					});
				}
			}

			if (options.length > 0) {
				selectMenu.addOptions(options.slice(0, 25));
				container.addActionRowComponents((actionRow) => actionRow.setComponents(selectMenu));
			}
		}

		// Buttons Section
		const buttons: ButtonBuilder[] = [];
		if (parent) {
			buttons.push(
				new ButtonBuilder()
					.setCustomId(CustomIds.BACK)
					.setLabel(this.t(LanguageKeys.Globals.Back))
					.setStyle(ButtonStyle.Secondary)
					.setEmoji({ name: '◀️' })
			);
		}

		if (!isSchemaGroup(this.schema)) {
			// It is a key
			const settings = await readSettings(this.interaction.guild);
			const value = settings[this.schema.property];

			// Set
			buttons.push(new ButtonBuilder().setCustomId(CustomIds.SET).setLabel(this.t(LanguageKeys.Globals.Set)).setStyle(ButtonStyle.Primary));

			// Remove (if array and has elements)
			if (this.schema.array && (value as unknown[]).length) {
				buttons.push(
					new ButtonBuilder().setCustomId(CustomIds.REMOVE).setLabel(this.t(LanguageKeys.Globals.Remove)).setStyle(ButtonStyle.Danger)
				);
			}

			// Reset (if changed)
			if (value !== this.schema.default) {
				buttons.push(
					new ButtonBuilder().setCustomId(CustomIds.RESET).setLabel(this.t(LanguageKeys.Globals.Reset)).setStyle(ButtonStyle.Danger)
				);
			}

			// Undo (if updated)
			if (this.updatedValue) {
				buttons.push(
					new ButtonBuilder()
						.setCustomId(CustomIds.UNDO)
						.setLabel(this.t(LanguageKeys.Commands.Conf.MenuRenderUndo))
						.setStyle(ButtonStyle.Secondary)
				);
			}
		}

		buttons.push(
			new ButtonBuilder()
				.setCustomId(CustomIds.STOP)
				.setLabel(this.t(LanguageKeys.Globals.Stop))
				.setStyle(ButtonStyle.Danger)
				.setEmoji({ name: '⏹️' })
		);

		// Add buttons in groups of 5 (Discord limit per ActionRow)
		for (let i = 0; i < buttons.length; i += 5) {
			const chunk = buttons.slice(i, i + 5);
			container.addActionRowComponents((actionRow) => actionRow.setComponents(...chunk));
		}

		return { components: [container], flags: [MessageFlags.IsComponentsV2] };
	}

	private async renderInput() {
		const key = this.schema as SchemaKey;
		const container = new ContainerBuilder().setAccentColor(getColor(this.interaction));

		container.addTextDisplayComponents((textDisplay) => textDisplay.setContent(this.t(LanguageKeys.Commands.Conf.MenuRenderUpdate)));

		// Remove Mode: Show Select Menu with current values to remove
		if (this.inputType === UpdateType.Remove) {
			const settings = await readSettings(this.interaction.guild);
			const values = settings[key.property] as unknown[];

			if (values.length) {
				const selectMenu = new StringSelectMenuBuilder()
					.setCustomId(CustomIds.INPUT_REMOVE)
					.setPlaceholder(this.t(LanguageKeys.Commands.Conf.MenuRenderSelect));
				const options = await Promise.all(
					values.map((val, index) => {
						const label = key.stringify(settings, this.t, val as any).substring(0, 100);
						// Better: For Roles/Channels, we can use their ID if available.
						let valueId = String(val);
						if (val && typeof val === 'object' && 'id' in val) {
							// @ts-expect-error accessing id
							valueId = val.id;
						}

						return {
							label: label || 'Unknown',
							value: valueId.substring(0, 100),
							description: String(index)
						};
					})
				);

				selectMenu.addOptions(options.slice(0, 25));
				container.addActionRowComponents((actionRow) => actionRow.setComponents(selectMenu));
			} else {
				container.addTextDisplayComponents((textDisplay) => textDisplay.setContent(this.t(LanguageKeys.Globals.None)));
			}
		}
		// Set Mode
		else {
			// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
			switch (key.type) {
				case 'boolean': {
					container.addActionRowComponents((actionRow) =>
						actionRow.setComponents(
							new ButtonBuilder()
								.setCustomId(CustomIds.INPUT_BOOL_TRUE)
								.setLabel(this.t(LanguageKeys.Globals.Yes))
								.setStyle(ButtonStyle.Success),
							new ButtonBuilder()
								.setCustomId(CustomIds.INPUT_BOOL_FALSE)
								.setLabel(this.t(LanguageKeys.Globals.No))
								.setStyle(ButtonStyle.Danger)
						)
					);
					break;
				}
				case 'role': {
					const select = new RoleSelectMenuBuilder()
						.setCustomId(CustomIds.INPUT_ROLE)
						.setPlaceholder(this.t(LanguageKeys.Commands.Conf.MenuRenderSelect));
					container.addActionRowComponents((actionRow) => actionRow.setComponents(select));
					break;
				}
				case 'guildTextChannel':
				case 'guildVoiceChannel': {
					const select = new ChannelSelectMenuBuilder()
						.setCustomId(CustomIds.INPUT_CHANNEL)
						.setPlaceholder(this.t(LanguageKeys.Commands.Conf.MenuRenderSelect));

					if (key.type === 'guildTextChannel') select.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
					if (key.type === 'guildVoiceChannel') select.setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice);

					container.addActionRowComponents((actionRow) => actionRow.setComponents(select));
					break;
				}
			}
		}

		// Cancel Button
		container.addActionRowComponents((actionRow) =>
			actionRow.setComponents(
				new ButtonBuilder().setCustomId(CustomIds.CANCEL).setLabel(this.t(LanguageKeys.Globals.Cancel)).setStyle(ButtonStyle.Secondary)
			)
		);

		return { components: [container], flags: [MessageFlags.IsComponentsV2] };
	}

	private async renderKey(entry: SchemaKey) {
		const settings = await readSettings(this.interaction.guild);

		this.t = getT(settings.language);
		const { t } = this;

		const description = [t(LanguageKeys.Commands.Conf.MenuRenderAtPiece, { path: this.schema.name })];
		if (this.errorMessage) description.push('', this.errorMessage, '');

		description.push(t(entry.description));

		const serialized = entry.display(settings, this.t);
		description.push('', t(LanguageKeys.Commands.Conf.MenuRenderCvalue, { value: serialized }));

		return description;
	}

	private renderGroup(entry: SchemaGroup) {
		const { t } = this;

		const description = [t(LanguageKeys.Commands.Conf.MenuRenderAtFolder, { path: entry.name })];
		if (this.errorMessage) description.push(this.errorMessage);

		const [folders, keys] = partition(
			filter(entry.values(), (value) => !value.dashboardOnly),
			(value) => isSchemaGroup(value)
		);

		if (!folders.length && !keys.length) {
			description.push(t(LanguageKeys.Commands.Conf.MenuRenderNokeys));
		} else {
			description.push(
				t(LanguageKeys.Commands.Conf.MenuRenderSelect),
				'',
				...folders.map(({ key }) => `📁 ${key}`),
				...keys.map(({ key }) => `⚙️ ${key}`)
			);
		}

		return description;
	}

	private async onInteraction(interaction: MessageComponentInteraction, context: WolfCommand.RunContext) {
		if (interaction.message.id !== this.response?.id) return;
		if (interaction.user.id !== this.interaction.user.id) return;
		this.collector?.setTime(TIMEOUT);
		this.errorMessage = null;

		// Handle Select Menu for Navigation
		if (interaction.isStringSelectMenu() && interaction.customId === CustomIds.SELECT) {
			await interaction.deferUpdate();
			const selectedKey = interaction.values[0];
			if (isSchemaGroup(this.schema)) {
				const next = this.schema.get(selectedKey);
				if (next) {
					this.schema = next;
					this.oldValue = undefined;
				}
			}
			await this._renderResponse();
			return;
		}

		// Handle Input Mode Interactions
		if (this.inputMode) {
			if (interaction.customId === CustomIds.CANCEL) {
				await interaction.deferUpdate();
				this.inputMode = false;
				await this._renderResponse();
				return;
			}

			if (interaction.customId === CustomIds.INPUT_BOOL_TRUE) {
				await interaction.deferUpdate();
				await this.processUpdate(this.inputType, 'true', context);
				return;
			}

			if (interaction.customId === CustomIds.INPUT_BOOL_FALSE) {
				await interaction.deferUpdate();
				await this.processUpdate(this.inputType, 'false', context);
				return;
			}

			if (interaction.isRoleSelectMenu() && interaction.customId === CustomIds.INPUT_ROLE) {
				await interaction.deferUpdate();
				// Use the first selected role ID
				const roleId = interaction.values[0];
				await this.processUpdate(this.inputType, roleId, context);
				return;
			}

			if (interaction.isChannelSelectMenu() && interaction.customId === CustomIds.INPUT_CHANNEL) {
				await interaction.deferUpdate();
				const channelId = interaction.values[0];
				await this.processUpdate(this.inputType, channelId, context);
				return;
			}

			if (interaction.isStringSelectMenu() && interaction.customId === CustomIds.INPUT_REMOVE) {
				await interaction.deferUpdate();
				const value = interaction.values[0];
				await this.processUpdate(this.inputType, value, context);
				return;
			}

			if (interaction.customId === CustomIds.INPUT_MODAL) {
				// Re-trigger modal
				await this.showInputModal(interaction, context, this.inputType);
				return;
			}
		}

		if (interaction.isButton()) {
			switch (interaction.customId) {
				case CustomIds.BACK:
					await interaction.deferUpdate();
					if (this.schema.parent) {
						this.schema = this.schema.parent;
						this.oldValue = undefined;
					}
					await this._renderResponse();
					break;
				case CustomIds.STOP:
					await interaction.deferUpdate();
					this.stop();
					break;
				case CustomIds.RESET:
					await interaction.deferUpdate();
					await this.tryUpdate(UpdateType.Reset);
					await this._renderResponse();
					break;
				case CustomIds.UNDO:
					await interaction.deferUpdate();
					await this.tryUndo();
					await this._renderResponse();
					break;
				case CustomIds.SET:
					await this.initiateInput(interaction, context, UpdateType.Set);
					break;
				case CustomIds.REMOVE:
					await this.initiateInput(interaction, context, UpdateType.Remove);
					break;
			}
		}
	}

	private async initiateInput(interaction: MessageComponentInteraction, context: WolfCommand.RunContext, type: UpdateType) {
		this.inputType = type;
		const key = this.schema as SchemaKey;

		// Check if we can use special components
		const useComponent =
			(type === UpdateType.Set && ['boolean', 'role', 'guildTextChannel', 'guildVoiceChannel'].includes(key.type)) ||
			(type === UpdateType.Remove && key.array); // For Remove, we use a select menu if array

		if (useComponent) {
			this.inputMode = true;
			await interaction.deferUpdate();
			await this._renderResponse();
		} else {
			// Use Modal
			await this.showInputModal(interaction, context, type);
		}
	}

	private async showInputModal(interaction: MessageComponentInteraction, context: WolfCommand.RunContext, type: UpdateType) {
		const modalId = `conf-modal-${Date.now()}`;
		const inputId = `conf-input-${Date.now()}`;

		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(this.t(type === UpdateType.Set ? LanguageKeys.Globals.Set : LanguageKeys.Globals.Remove));

		const key = this.schema as SchemaKey;

		const input = new TextInputBuilder().setCustomId(inputId).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(key.name);
		const label = new LabelBuilder().setLabel(this.t(LanguageKeys.Globals.Value)).setTextInputComponent(input);

		modal.addLabelComponents(label);

		await interaction.showModal(modal);

		try {
			const submission = await interaction.awaitModalSubmit({
				time: minutes(5),
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id
			});

			const value = submission.fields.getTextInputValue(inputId);
			await submission.deferUpdate();

			await this.processUpdate(type, value, context);
		} catch (error) {
			if (
				error instanceof Error &&
				(error.name === 'InteractionCollectorError' ||
					error.name === 'Error [InteractionCollectorError]' ||
					error.message === 'Collector received no interactions before ending with reason: time')
			) {
				// Ignore timeout
			} else {
				this.errorMessage = stringifyError(this.t, error);
				await this._renderResponse();
			}
		}
	}

	private async processUpdate(type: UpdateType, value: string, context: WolfCommand.RunContext) {
		const conf = container.stores.get('commands').get('conf') as MessageCommand;
		// Create a minimal message proxy for WolfArgs compatibility
		const messageProxy = {
			guild: this.interaction.guild,
			channel: this.interaction.channel,
			author: this.interaction.user,
			client: this.interaction.client
		} as any;
		const args = WolfArgs.from(conf, messageProxy, value, context, this.t);
		await this.tryUpdate(type, args);
		this.inputMode = false;
		await this._renderResponse();
	}

	private async _renderResponse() {
		if (!this.response) return;
		try {
			const payload = await this.render();
			// @ts-expect-error - v2 components are experimental
			await this.response.edit(payload);
		} catch (error) {
			if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) {
				this.response = null;
				this.collector?.end();
			} else {
				this.client.emit('error', error as Error);
			}
		}
	}

	private async tryUpdate(action: UpdateType, args: WolfArgs | null = null, value: unknown = null) {
		try {
			const key = this.schema as SchemaKey;
			using trx = await writeSettingsTransaction(this.interaction.guild);

			this.t = getT(trx.settings.language);
			this.oldValue = trx.settings[key.property];
			switch (action) {
				case UpdateType.Set: {
					trx.write(await set(trx.settings, key, args!));
					break;
				}
				case UpdateType.Remove: {
					trx.write(await remove(trx.settings, key, args!));
					break;
				}
				case UpdateType.Reset: {
					trx.write(reset(key));
					break;
				}
				case UpdateType.Replace: {
					trx.write({ [key.property]: value });
					break;
				}
			}
			await trx.submit();
		} catch (error) {
			this.errorMessage = stringifyError(this.t, error);
			this.oldValue = undefined;
		}
	}

	private async tryUndo() {
		if (this.updatedValue) {
			await this.tryUpdate(UpdateType.Replace, null, this.oldValue);
			this.oldValue = undefined;
		} else {
			const key = this.schema as SchemaKey;
			this.errorMessage = this.t(LanguageKeys.Commands.Conf.Nochange, { key: key.name });
		}
	}

	private stop(): void {
		if (this.response) {
			const content = this.t(LanguageKeys.Commands.Conf.MenuSaved);
			const container = new ContainerBuilder()
				.setAccentColor(getColor(this.interaction))
				.addTextDisplayComponents((textDisplay) => textDisplay.setContent(content));

			floatPromise(this.response.edit({ components: [container], flags: [MessageFlags.IsComponentsV2] }));
		}

		if (this.collector && !this.collector.ended) {
			this.collector.end();
		}
	}
}
