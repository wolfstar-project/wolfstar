import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * The parent of the `roles` subcommands (`list`, `claim`, `unclaim` and `browse`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`, to list, claim and unclaim the public roles of the server, and to browse
 * all of its roles in a menu.
 *
 * @remarks
 *
 * - `claim` only adds a role, and `unclaim` only removes it.
 * - A role is given per call.
 * - The list is one embed, since there is no message to page through with an HTTP interaction. It is cut at the
 *   limit of the description of an embed.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:roles')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {}
