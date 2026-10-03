import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `case` subcommands (`view`, `list`, `edit`, `archive` and `delete`), which are wired onto this
 * command by `@wolfstar/plugin-subcommands-advanced`, to view, list, edit, archive and delete the moderation cases of
 * the guild.
 *
 * @remarks
 *
 * - This replaces the `case`, `reason`, `time`, `history` and `moderations` prefix commands, and the
 *   `case-deprecations` command that only pointed the prefix aliases to this command: the prefix aliases do not exist
 *   in the slash command stack, so that command was dropped.
 * - The paginated message of `list` is a single reply of the page given in the `page` option.
 * - `edit` with `duration` set to `0` removes the duration of the case, which is what `time --cancel` did.
 * - Every subcommand requires the moderator permission level.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/case:name', 'commands/case:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {}
