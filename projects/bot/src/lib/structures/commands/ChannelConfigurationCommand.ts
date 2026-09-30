import { writeSettingsTransaction, type GuildSettingsOfType } from '#lib/database';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { channelMention, type SlashCommandBuilder } from '@discordjs/builders';
import type { Nullish } from '@sapphire/utilities';
import { Command, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The key used when the channel is removed from the configuration, because none of the options was given.
 *
 * @remarks Not part of `commands/management` yet: it needs `"configurationChannelReset"` in the `en-US` locale.
 */
const ResetKey = 'commands/management:configurationChannelReset' as TranslationKey;

/**
 * The key used when the configured value is the same one that was given.
 */
const EqualsKey = 'commands/management:configurationEquals' satisfies TranslationKey;

/**
 * The base class of the commands that store a single channel in the settings of the guild, for example `set-mod-logs`.
 *
 * The channel is configured through the optional `channel` option, leaving it empty removes the channel from the
 * settings. Register the subclasses with {@linkcode ChannelConfigurationCommand.applyBuilder}:
 *
 * @example
 * ```typescript
 * \@RegisterCommand((builder) => ChannelConfigurationCommand.applyBuilder(builder, 'commands/management:setModLogs', 'commands/management:setmodlogs'))
 * export class UserCommand extends ChannelConfigurationCommand {
 * 	public constructor(context: ChannelConfigurationCommand.LoaderContext, options: ChannelConfigurationCommand.Options) {
 * 		super(context, { ...options, responseKey: 'commands/management:setModLogsSet', settingsKey: 'moderationChannel' });
 * 	}
 * }
 * ```
 */
export abstract class ChannelConfigurationCommand extends Command<ChannelConfigurationCommand.Options> {
	private readonly responseKey: TranslationKey;
	private readonly settingsKey: GuildSettingsOfType<string | Nullish>;

	public constructor(context: ChannelConfigurationCommand.LoaderContext, options: ChannelConfigurationCommand.Options) {
		super(context, options);

		this.responseKey = options.responseKey;
		this.settingsKey = options.settingsKey;
	}

	public override async chatInputRun(interaction: GuildChatInputInteraction, options: ChannelConfigurationCommand.Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);

		const channelId = options.channel?.id ?? null;

		using trx = await writeSettingsTransaction(interaction.guildId);
		if ((trx.settings as Readonly<Record<string, unknown>>)[this.settingsKey] === channelId) {
			return interaction.reply({ content: translateKey(t, EqualsKey), flags: MessageFlags.Ephemeral });
		}

		await trx.write({ [this.settingsKey]: channelId }).submitWithAudit(interaction.user.id);

		const content = channelId === null ? translateKey(t, ResetKey) : translateKey(t, this.responseKey, { channel: channelMention(channelId) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	/**
	 * Applies the name, the description, the scope, the default permissions and the `channel` option to a builder.
	 *
	 * @param builder - The builder to apply the data to.
	 * @param root - The root key for the name and the description of the command, e.g. `commands/management:setModLogs`.
	 * @param optionRoot - The root key for the name and the description of the `channel` option, e.g.
	 * `commands/management:setmodlogsOptionsChannel`.
	 */
	public static applyBuilder(builder: SlashCommandBuilder, root: `${string}:${string}`, optionRoot: `${string}:${string}`) {
		return applyLocalizedBuilder(builder, root)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setContexts(InteractionContextType.Guild)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
			.addChannelOption((option) =>
				applyLocalizedBuilder(option, optionRoot).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false)
			);
	}
}

export namespace ChannelConfigurationCommand {
	export type LoaderContext = Command.LoaderContext;

	/**
	 * The ChannelConfigurationCommand Options
	 */
	export interface Options extends Command.Options {
		/**
		 * The key of the message sent after the channel was set, it receives the `channel` mention.
		 */
		responseKey: TranslationKey;

		/**
		 * The setting the channel is stored in.
		 */
		settingsKey: GuildSettingsOfType<string | Nullish>;
	}

	/**
	 * The options of the slash command.
	 */
	export interface Arguments {
		channel?: TransformedArguments.Channel;
	}
}
