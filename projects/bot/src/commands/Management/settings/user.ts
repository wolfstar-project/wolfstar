import { fetchUserReportEnabled } from '#lib/database';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { renderUserSettings } from '#lib/structures/settings-menu';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/settings user`, see the `settings` parent command.
 *
 * Opens the settings of the user who ran it, which are stored in the `User` model and are the same in every server.
 *
 * @remarks Everybody can use it, and the menu is only for them, like the one of `/settings server`. The clicks are
 * handled by the `conf` interaction handler.
 */
@RegisterAsSubcommand('settings', (builder) => applyLocalizedBuilder(builder, 'commands/conf:settingsUser'))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const report = await fetchUserReportEnabled(interaction.user.id);
		return interaction.reply(renderUserSettings({ t, ownerId: interaction.user.id, report }));
	}
}
