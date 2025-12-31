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
import { api } from '#lib/discord/Api';
import { getT } from '#lib/i18n';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfArgs, type WolfCommand } from '#lib/structures';
import { Events, type GuildMessage } from '#lib/types';
import { floatPromise, minutes, stringifyError } from '#utils/common';
import { ZeroWidthSpace } from '#utils/constants';
import { getColor, getFullEmbedAuthor, sendLoadingMessage } from '#utils/util';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ChannelSelectMenuBuilder,
	EmbedBuilder,
	ModalBuilder,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder
} from '@discordjs/builders';
import { container, type MessageCommand } from '@sapphire/framework';
import { filter, partition } from '@sapphire/iterator-utilities';
import type { TFunction } from '@sapphire/plugin-i18next';
import { isNullish } from '@sapphire/utilities';
import {
	ButtonStyle,
	ChannelType,
	ComponentType,
	DiscordAPIError,
	InteractionCollector,
	RESTJSONErrorCodes,
	TextInputStyle,
	type Interaction,
	type Message,
	type MessageActionRowComponentBuilder,
	type MessageComponentInteraction,
	type ModalActionRowComponentBuilder
} from 'discord.js';

const TIMEOUT = minutes(15);

const enum UpdateType {
	Set,
	Remove,
	Reset,
	Replace
}

export class SettingsMenu {
	private readonly message: GuildMessage;
	private t: TFunction;
	private schema: SchemaKey | SchemaGroup;
	private collector: InteractionCollector<any> | null = null;
	private errorMessage: string | null = null;
	private readonly embed: EmbedBuilder;
	private response: Message | null = null;
	private oldValue: unknown = undefined;
	private inputMode = false;
	private inputType: UpdateType = UpdateType.Set;

	public constructor(message: GuildMessage, language: TFunction) {
		this.message = message;
		this.t = language;
		this.schema = getConfigurableGroups();
		this.embed = new EmbedBuilder().setAuthor(getFullEmbedAuthor(this.message.author));
	}

	public get client() {
		return container.client;
	}

	private get updatedValue(): boolean {
		return this.oldValue !== undefined;
	}

	public async init(context: WolfCommand.RunContext): Promise<void> {
		this.response = await sendLoadingMessage(this.message, this.t);
		await this._renderResponse();

		this.collector = this.response.createMessageComponentCollector({
			filter: (i) => i.user.id === this.message.author.id,
			time: TIMEOUT
		});

		this.collector.on('collect', (i) => this.onInteraction(i, context));
		this.collector.on('end', () => this.stop());
	}

	private async render() {
		if (this.inputMode) {
			return this.renderInput();
		}

		const description = isSchemaGroup(this.schema) ? this.renderGroup(this.schema) : await this.renderKey(this.schema);
		const { parent } = this.schema;

		this.embed
			.setColor(getColor(this.message)) //
			.setDescription(description.concat(ZeroWidthSpace).join('\n'))
			.setTimestamp()
			.setFooter(parent ? { text: this.t(LanguageKeys.Commands.Admin.ConfMenuRenderBack) } : null);

		const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

		// Select Menu Row
		if (isSchemaGroup(this.schema)) {
			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('conf-select')
				.setPlaceholder(this.t(LanguageKeys.Commands.Admin.ConfMenuRenderSelect));

			const options = [];
			// Collect folders
			for (const value of this.schema.values()) {
				if (value.dashboardOnly) continue;
				if (isSchemaGroup(value)) {
					options.push({
						label: value.name,
						value: value.key,
						emoji: '📁',
						description: this.t(LanguageKeys.Commands.Admin.ConfMenuRenderAtFolder, { path: value.name }).substring(0, 100)
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
						emoji: '⚙️',
						description: this.t(LanguageKeys.Commands.Admin.ConfMenuRenderAtPiece, { path: value.name }).substring(0, 100)
					});
				}
			}

			if (options.length > 0) {
				selectMenu.addOptions(options.slice(0, 25));
				rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu));
			}
		}

		// Button Rows
		const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>();
		if (parent) {
			buttons.addComponents(new ButtonBuilder().setCustomId('conf-back').setLabel(this.t(LanguageKeys.Globals.Back)).setStyle(ButtonStyle.Secondary).setEmoji('◀️'));
		}

		if (!isSchemaGroup(this.schema)) {
			// It is a key
			const settings = await readSettings(this.message.guild);
			const value = settings[this.schema.property];

			// Set
			buttons.addComponents(new ButtonBuilder().setCustomId('conf-set').setLabel(this.t(LanguageKeys.Globals.Set)).setStyle(ButtonStyle.Primary));

			// Remove (if array and has elements)
			if (this.schema.array && (value as unknown[]).length) {
				buttons.addComponents(new ButtonBuilder().setCustomId('conf-remove').setLabel(this.t(LanguageKeys.Globals.Remove)).setStyle(ButtonStyle.Danger));
			}

			// Reset (if changed)
			if (value !== this.schema.default) {
				buttons.addComponents(new ButtonBuilder().setCustomId('conf-reset').setLabel(this.t(LanguageKeys.Globals.Reset)).setStyle(ButtonStyle.Danger));
			}

			// Undo (if updated)
			if (this.updatedValue) {
				buttons.addComponents(new ButtonBuilder().setCustomId('conf-undo').setLabel(this.t(LanguageKeys.Commands.Admin.ConfMenuRenderUndo)).setStyle(ButtonStyle.Secondary));
			}
		}

		buttons.addComponents(new ButtonBuilder().setCustomId('conf-stop').setLabel(this.t(LanguageKeys.Globals.Stop)).setStyle(ButtonStyle.Danger).setEmoji('⏹️'));
		rows.push(buttons);

		return { embeds: [this.embed], components: rows };
	}

	private async renderInput() {
		const key = this.schema as SchemaKey;
		const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

		this.embed.setDescription(this.t(LanguageKeys.Commands.Admin.ConfMenuRenderUpdate));

		// Remove Mode: Show Select Menu with current values to remove
		if (this.inputType === UpdateType.Remove) {
			const settings = await readSettings(this.message.guild);
			const values = settings[key.property] as unknown[];

			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('conf-input-remove')
				.setPlaceholder(this.t(LanguageKeys.Commands.Admin.ConfMenuRenderSelect));

			// We need to stringify values to show labels, and use ID or value as value.
			// Ideally we use serializer to stringify.
			// If options > 25, we slice.

			const options = await Promise.all(values.map(async (val, index) => {
				const label = key.stringify(settings, this.t, val).substring(0, 100);
				// We use the serialized value as the 'value' to pass to WolfArgs, assuming WolfArgs can parse it back.
				// However, WolfArgs parses input string. Serializer stringifies it to human readable.
				// For Roles/Channels, stringify usually gives name or mention.
				// For ID-based parsing, we need the ID.
				// This is tricky. simpler approach: Just show indices? No, user doesn't know indices.

				// Better: For Roles/Channels, we can use their ID if available.
				let valueId = String(val);
				if (val && typeof val === 'object' && 'id' in val) {
					// @ts-expect-error accessing id
					valueId = val.id;
				} else {
					// Try to use the raw value if it's primitive.
					// If it's a string, it might have spaces.
				}

				// Fallback: Use the serialized string and hope WolfArgs can resolve it (e.g. by name).
				// Or, use the index and let 'remove' handle index?
				// Database 'remove' function uses `serializer.equals` finding the value.
				// If we pass the EXACT value via WolfArgs, it should work.
				// But we are passing a string.
				// Let's stick to showing the Remove Button (which we did) which leads here.

				// Actually, for arrays, showing a list to remove is best.
				// But constructing the correct string for WolfArgs to recreate the object is hard for complex types.
				// For Roles, Channels, Users: ID is best.
				// For Strings: The string itself.

				return {
					label: label || 'Unknown',
					value: valueId.substring(0, 100),
					description: String(index)
				};
			}));

			if (options.length) {
				selectMenu.addOptions(options.slice(0, 25));
				rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu));
			} else {
				this.embed.setDescription(this.t(LanguageKeys.Globals.None));
			}
		}
		// Set Mode
		else {
			switch (key.type) {
				case 'boolean': {
					rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
						new ButtonBuilder().setCustomId('conf-input-bool-true').setLabel(this.t(LanguageKeys.Globals.Yes)).setStyle(ButtonStyle.Success),
						new ButtonBuilder().setCustomId('conf-input-bool-false').setLabel(this.t(LanguageKeys.Globals.No)).setStyle(ButtonStyle.Danger)
					));
					break;
				}
				case 'role': {
					const select = new RoleSelectMenuBuilder()
						.setCustomId('conf-input-role')
						.setPlaceholder(this.t(LanguageKeys.Commands.Admin.ConfMenuRenderSelect));
					rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select));
					break;
				}
				case 'guildTextChannel':
				case 'guildVoiceChannel': {
					const select = new ChannelSelectMenuBuilder()
						.setCustomId('conf-input-channel')
						.setPlaceholder(this.t(LanguageKeys.Commands.Admin.ConfMenuRenderSelect));

					if (key.type === 'guildTextChannel') select.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
					if (key.type === 'guildVoiceChannel') select.setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice);

					rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select));
					break;
				}
				// For others, we might have used Modal, but since we are in `renderInput`,
				// if we want to support Modal for others, we should have triggered it immediately in `onInteraction`.
				// So if we are here, it means we don't use Modal, OR we show a "Click to Enter Value" button which opens Modal.
				// But that adds a step.
				// Better: In `onInteraction`, if type is string/number, open Modal immediately and don't enter `inputMode` unless we want to show error state.
				default: {
					// Fallback to button that opens modal (if we ended up here)
					rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
						new ButtonBuilder().setCustomId('conf-input-modal').setLabel(this.t(LanguageKeys.Globals.Set)).setStyle(ButtonStyle.Primary)
					));
				}
			}
		}

		// Cancel Button
		rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			new ButtonBuilder().setCustomId('conf-cancel').setLabel(this.t(LanguageKeys.Globals.Cancel)).setStyle(ButtonStyle.Secondary)
		));

		return { embeds: [this.embed], components: rows };
	}

	private async renderKey(entry: SchemaKey) {
		const settings = await readSettings(this.message.guild);

		this.t = getT(settings.language);
		const { t } = this;

		const description = [t(LanguageKeys.Commands.Admin.ConfMenuRenderAtPiece, { path: this.schema.name })];
		if (this.errorMessage) description.push('', this.errorMessage, '');

		description.push(t(entry.description));

		const serialized = entry.display(settings, this.t);
		description.push('', t(LanguageKeys.Commands.Admin.ConfMenuRenderCvalue, { value: serialized }));

		return description;
	}

	private renderGroup(entry: SchemaGroup) {
		const { t } = this;

		const description = [t(LanguageKeys.Commands.Admin.ConfMenuRenderAtFolder, { path: entry.name })];
		if (this.errorMessage) description.push(this.errorMessage);

		const [folders, keys] = partition(
			filter(entry.values(), (value) => !value.dashboardOnly),
			(value) => isSchemaGroup(value)
		);

		if (!folders.length && !keys.length) {
			description.push(t(LanguageKeys.Commands.Admin.ConfMenuRenderNokeys));
		} else {
			description.push(
				t(LanguageKeys.Commands.Admin.ConfMenuRenderSelect),
				'',
				...folders.map(({ key }) => `📁 ${key}`),
				...keys.map(({ key }) => `⚙️ ${key}`)
			);
		}

		return description;
	}

	private async onInteraction(interaction: MessageComponentInteraction, context: WolfCommand.RunContext) {
		this.collector?.resetTimer();
		this.errorMessage = null;

		// Handle Select Menu for Navigation
		if (interaction.isStringSelectMenu() && interaction.customId === 'conf-select') {
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
			if (interaction.customId === 'conf-cancel') {
				await interaction.deferUpdate();
				this.inputMode = false;
				await this._renderResponse();
				return;
			}

			if (interaction.customId === 'conf-input-bool-true') {
				await interaction.deferUpdate();
				await this.processUpdate(this.inputType, 'true', context);
				return;
			}

			if (interaction.customId === 'conf-input-bool-false') {
				await interaction.deferUpdate();
				await this.processUpdate(this.inputType, 'false', context);
				return;
			}

			if (interaction.isRoleSelectMenu() && interaction.customId === 'conf-input-role') {
				await interaction.deferUpdate();
				// Use the first selected role ID
				const roleId = interaction.values[0];
				await this.processUpdate(this.inputType, roleId, context);
				return;
			}

			if (interaction.isChannelSelectMenu() && interaction.customId === 'conf-input-channel') {
				await interaction.deferUpdate();
				const channelId = interaction.values[0];
				await this.processUpdate(this.inputType, channelId, context);
				return;
			}

			if (interaction.isStringSelectMenu() && interaction.customId === 'conf-input-remove') {
				await interaction.deferUpdate();
				const value = interaction.values[0];
				await this.processUpdate(this.inputType, value, context);
				return;
			}

			if (interaction.customId === 'conf-input-modal') {
				// Re-trigger modal
				await this.showInputModal(interaction, context, this.inputType);
				return;
			}
		}

		if (interaction.isButton()) {
			switch (interaction.customId) {
				case 'conf-back':
					await interaction.deferUpdate();
					if (this.schema.parent) {
						this.schema = this.schema.parent;
						this.oldValue = undefined;
					}
					await this._renderResponse();
					break;
				case 'conf-stop':
					await interaction.deferUpdate();
					this.stop();
					break;
				case 'conf-reset':
					await interaction.deferUpdate();
					await this.tryUpdate(UpdateType.Reset);
					await this._renderResponse();
					break;
				case 'conf-undo':
					await interaction.deferUpdate();
					await this.tryUndo();
					await this._renderResponse();
					break;
				case 'conf-set':
					await this.initiateInput(interaction, context, UpdateType.Set);
					break;
				case 'conf-remove':
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

		const input = new TextInputBuilder()
			.setCustomId(inputId)
			.setLabel(this.t(LanguageKeys.Globals.Value))
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input);
		modal.addComponents(row);

		await interaction.showModal(modal);

		try {
			const submission = await interaction.awaitModalSubmit({
				time: minutes(5),
				filter: (i) => i.customId === modalId
			});

			const value = submission.fields.getTextInputValue(inputId);
			await submission.deferUpdate();

			await this.processUpdate(type, value, context);

		} catch (error) {
			if (error instanceof Error && error.message.includes('time')) {
				// Ignore timeout
			} else {
				this.errorMessage = stringifyError(this.t, error);
				await this._renderResponse();
			}
		}
	}

	private async processUpdate(type: UpdateType, value: string, context: WolfCommand.RunContext) {
		const conf = container.stores.get('commands').get('conf') as MessageCommand;
		const args = WolfArgs.from(conf, this.message, value, context, this.t);
		await this.tryUpdate(type, args);
		this.inputMode = false;
		await this._renderResponse();
	}

	private async _renderResponse() {
		if (!this.response) return;
		try {
			const payload = await this.render();
			await this.response.edit(payload);
		} catch (error) {
			if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) {
				this.response = null;
				this.collector?.stop();
			} else {
				this.client.emit(Events.Error, error as Error);
			}
		}
	}

	private async tryUpdate(action: UpdateType, args: WolfArgs | null = null, value: unknown = null) {
		try {
			const key = this.schema as SchemaKey;
			using trx = await writeSettingsTransaction(this.message.guild);

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
		}
	}

	private async tryUndo() {
		if (this.updatedValue) {
			await this.tryUpdate(UpdateType.Replace, null, this.oldValue);
		} else {
			const key = this.schema as SchemaKey;
			this.errorMessage = this.t(LanguageKeys.Commands.Admin.ConfNochange, { key: key.name });
		}
	}

	private stop(): void {
		if (this.response) {
			const content = this.t(LanguageKeys.Commands.Admin.ConfMenuSaved);
			floatPromise(this.response.edit({ content, embeds: [], components: [] }));
		}

		if (this.collector && !this.collector.ended) {
			this.collector.stop();
		}
	}
}
