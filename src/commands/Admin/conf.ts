import { getConfigurableGroups, isSchemaKey, readSettings, remove, reset, SchemaKey, set, writeSettingsTransaction } from '#lib/database';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { getSupportedUserLanguageT } from '#lib/i18n/translate';
import { SettingsMenu, WolfArgs, WolfSubcommand } from '#lib/structures';
import { PermissionLevels } from '#lib/types';
import { isValidCustomEmoji, isValidSerializedTwemoji, isValidTwemoji } from '#lib/util/functions/emojis';
import { chatInputApplicationCommandMention, inlineCode } from '@discordjs/builders';
import { ApplyOptions, RequiresClientPermissions } from '@sapphire/decorators';
import { ApplicationCommandRegistry, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { applyLocalizedBuilder } from '@sapphire/plugin-i18next';
import { filter, map, toArray } from '@sapphire/iterator-utilities';
import { isNullish, toTitleCase } from '@sapphire/utilities';
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { send } from '@sapphire/plugin-editable-commands';
import type { GuildMessage } from 'lib/types/Discord.js';
import { cast } from 'lib/util/util.js';

const Root = LanguageKeys.Commands.Conf;

@ApplyOptions<WolfSubcommand.Options>({
	description: Root.Description,
	detailedDescription: LanguageKeys.Commands.Shared.SlashOnlyDetailedDescription,
	guarded: true,
	permissionLevel: PermissionLevels.Administrator,
	requiredClientPermissions: [PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	hidden: true,
	subcommands: [
		{ name: 'menu', chatInputRun: 'chatInputRunMenu', default: true },
		{ name: 'show', chatInputRun: 'chatInputRunShow' },
		{ name: 'set', chatInputRun: 'chatInputRunSet' },
		{ name: 'remove', chatInputRun: 'chatInputRunRemove' },
		{ name: 'reset', chatInputRun: 'chatInputRunReset' }
	]
})
export class UserCommand extends WolfSubcommand {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
		registry.registerChatInputCommand((builder) =>
			applyLocalizedBuilder(builder, Root.Name, Root.Description)
				.setContexts(InteractionContextType.Guild)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addSubcommand(
					(subcommand) => applyLocalizedBuilder(subcommand, Root.Menu, Root.MenuDescription) //
				)
				.addSubcommand((subcommand) =>
					applyLocalizedBuilder(subcommand, Root.Show, Root.ShowDescription) //
						.addStringOption((option) => applyLocalizedBuilder(option, Root.OptionKey, Root.OptionKeyDescription).setRequired(false))
				)
				.addSubcommand((subcommand) =>
					applyLocalizedBuilder(subcommand, Root.Set, Root.SetDescription) //
						.addStringOption((option) => applyLocalizedBuilder(option, Root.OptionKey, Root.OptionKeyDescription).setRequired(true))
						.addStringOption((option) => applyLocalizedBuilder(option, Root.OptionValue, Root.OptionValueDescription).setRequired(true))
				)
				.addSubcommand((subcommand) =>
					applyLocalizedBuilder(subcommand, Root.Remove, Root.RemoveDescription) //
						.addStringOption((option) => applyLocalizedBuilder(option, Root.OptionKey, Root.OptionKeyDescription).setRequired(true))
						.addStringOption((option) => applyLocalizedBuilder(option, Root.OptionValue, Root.OptionValueDescription).setRequired(true))
				)
				.addSubcommand((subcommand) =>
					applyLocalizedBuilder(subcommand, Root.Reset, Root.ResetDescription) //
						.addStringOption((option) => applyLocalizedBuilder(option, Root.OptionKey, Root.OptionKeyDescription).setRequired(true))
				)
		);
	}

	@RequiresClientPermissions(PermissionFlagsBits.EmbedLinks)
	public menu(message: GuildMessage, args: WolfSubcommand.Args) {
		return send(message, {
			content: args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, {
				command: chatInputApplicationCommandMention(this.name, 'show', this.getGlobalCommandId())
			})
		});
	}

	public async show(message: GuildMessage, args: WolfSubcommand.Args) {
		return send(message, {
			content: args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, {
				command: chatInputApplicationCommandMention(this.name, 'show', this.getGlobalCommandId())
			})
		});
	}

	public async set(message: GuildMessage, args: WolfSubcommand.Args) {
		return send(message, {
			content: args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, {
				command: chatInputApplicationCommandMention(this.name, 'show', this.getGlobalCommandId())
			})
		});
	}

	public async remove(message: GuildMessage, args: WolfSubcommand.Args) {
		return send(message, {
			content: args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, {
				command: chatInputApplicationCommandMention(this.name, 'show', this.getGlobalCommandId())
			})
		});
	}

	public async reset(message: GuildMessage, args: WolfSubcommand.Args) {
		return send(message, {
			content: args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, {
				command: chatInputApplicationCommandMention(this.name, 'show', this.getGlobalCommandId())
			})
		});
	}

	public async chatInputRunMenu(interaction: WolfSubcommand.Interaction, context: WolfSubcommand.RunContext) {
		const t = getSupportedUserLanguageT(interaction);
		return new SettingsMenu(interaction, t).init(context);
	}

	public async chatInputRunShow(interaction: WolfSubcommand.Interaction) {
		const t = getSupportedUserLanguageT(interaction);
		const key = interaction.options.getString('key') ?? '';
		const schemaValue = getConfigurableGroups().getPathString(key.toLowerCase());
		if (schemaValue === null) this.error(Root.GetNoExt, { key });

		const settings = await readSettings(interaction.guild);
		const output = schemaValue.display(settings, t);

		if (isSchemaKey(schemaValue)) {
			const content = t(Root.Get, { key: schemaValue.name, value: output });
			return interaction.reply({ content, allowedMentions: { users: [], roles: [] }, flags: MessageFlags.Ephemeral });
		}

		const title = key
			? `: ${key
					.split('.')
					.map((key) => toTitleCase(key))
					.join('/')}`
			: '';
		const content = t(Root.Server, { key: title, list: output });
		return interaction.reply({ content, allowedMentions: { users: [], roles: [] }, flags: MessageFlags.Ephemeral });
	}

	public async chatInputRunSet(interaction: WolfSubcommand.Interaction) {
		const t = getSupportedUserLanguageT(interaction);
		const [key, schemaKey] = await this.#fetchKeyFromInteraction(interaction, t);

		using trx = await writeSettingsTransaction(interaction.guild);
		const value = interaction.options.getString('value', true);

		// Create a minimal message proxy for WolfArgs compatibility
		const messageProxy = cast<any>({
			guild: interaction.guild,
			channel: interaction.channel,
			author: interaction.user,
			client: interaction.client
		});
		const args = WolfArgs.from(this, messageProxy, value, {} as any, t);
		await trx.write(await set(trx.settings, schemaKey, args)).submit();

		const response = schemaKey.display(trx.settings, t);
		const content = t(Root.Updated, { key, response: this.#getTextResponse(response) });
		return interaction.reply({ content, allowedMentions: { users: [], roles: [] }, flags: MessageFlags.Ephemeral });
	}

	public async chatInputRunRemove(interaction: WolfSubcommand.Interaction) {
		const t = getSupportedUserLanguageT(interaction);
		const [key, schemaKey] = await this.#fetchKeyFromInteraction(interaction, t);

		using trx = await writeSettingsTransaction(interaction.guild);
		const value = interaction.options.getString('value', true);

		// Create a minimal message proxy for WolfArgs compatibility
		const messageProxy = cast<any>({
			guild: interaction.guild,
			channel: interaction.channel,
			author: interaction.user,
			client: interaction.client
		});
		const args = WolfArgs.from(this, messageProxy, value, {} as any, t);
		await trx.write(await remove(trx.settings, schemaKey, args)).submit();

		const response = schemaKey.display(trx.settings, t);
		const content = t(Root.Updated, { key, response: this.#getTextResponse(response) });
		return interaction.reply({ content, allowedMentions: { users: [], roles: [] }, flags: MessageFlags.Ephemeral });
	}

	public async chatInputRunReset(interaction: WolfSubcommand.Interaction) {
		const t = getSupportedUserLanguageT(interaction);
		const [key, schemaKey] = await this.#fetchKeyFromInteraction(interaction, t);

		using trx = await writeSettingsTransaction(interaction.guild);
		await trx.write(reset(schemaKey)).submit();

		const response = schemaKey.display(trx.settings, t);
		const content = t(Root.ResetSuccess, { key, value: response });
		return interaction.reply({ content, allowedMentions: { users: [], roles: [] }, flags: MessageFlags.Ephemeral });
	}

	#getTextResponse(response: string) {
		return isValidCustomEmoji(response) || isValidSerializedTwemoji(response) || isValidTwemoji(response) ? response : inlineCode(response);
	}

	async #fetchKeyFromInteraction(interaction: WolfSubcommand.Interaction, t: ReturnType<typeof getSupportedUserLanguageT>) {
		const key = interaction.options.getString('key', true);
		const message = t(Root.GetNoExt, { key });

		const value = getConfigurableGroups().getPathString(key.toLowerCase());
		if (isNullish(value) || value.dashboardOnly) {
			this.error(message);
		}

		if (isSchemaKey(value)) {
			return [value.name, value as SchemaKey] as const;
		}

		const keys = map(
			filter(value.childValues(), (value) => !value.dashboardOnly),
			(value) => inlineCode(value.name)
		);
		this.error(LanguageKeys.Settings.Gateway.ChooseKey, { keys: toArray(keys) });
	}
}
