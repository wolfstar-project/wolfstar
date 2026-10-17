import { readSettings } from '#lib/database';
import { ConfigurationFileName, createConfigurationFile } from '#lib/database/settings/transfer/format';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommandGroup } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/settings server export`, see the `settings` parent command.
 *
 * Answers with a JSON file that holds the settings of the server that do not depend on it and its auto-moderation rules,
 * for `/settings server import` to read: to set up another server the same way, or to keep a copy before changing a lot.
 *
 * @remarks The reply is ephemeral, so the file is only for the administrator who asked. It requires the administrator
 * permission level. What names something of the server (roles, channels, users, and so the exempt roles and channels of
 * the rules) is not in the file, see `lib/database/settings/transfer/format`.
 */
@RegisterAsSubcommandGroup('settings', 'server', (builder) => applyLocalizedBuilder(builder, 'commands/conf:settingsServerExport'))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));

		// A file cannot be sent with the first response of an interaction, so it is acknowledged first:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

		const [settings, rules] = await Promise.all([readSettings(interaction.guildId), readAutoModerationRules(interaction.guildId)]);
		const file = createConfigurationFile(settings, rules);

		return deferred.update({
			content: t('commands/conf:transferExportDone', { settings: Object.keys(file.settings).length, rules: file.automod.rules.length }),
			files: [{ name: ConfigurationFileName, data: Buffer.from(JSON.stringify(file, null, '\t'), 'utf8'), contentType: 'application/json' }]
		});
	}
}
