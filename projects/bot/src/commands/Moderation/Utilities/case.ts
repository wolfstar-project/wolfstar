import { ApplyOptions } from '@wolfstar/decorators';
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
 * - `list` replies with a single page, the one given in the `page` option.
 * - `edit` with `duration` set to `0` removes the duration of the case.
 * - Every subcommand requires the moderator permission level.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['moderator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/case:name', 'commands/case:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {}
