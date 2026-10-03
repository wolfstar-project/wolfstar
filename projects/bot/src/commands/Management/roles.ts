import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * The parent of the `roles` subcommands (`list`, `claim` and `unclaim`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`, to list, claim and unclaim the public roles of the server. It replaces the
 * prefix `roles` command.
 *
 * @remarks
 *
 * - The prefix command toggled the roles it was given, and listed them when it was given none. They are now the `claim`,
 *   `unclaim` and `list` subcommands: `claim` only adds a role, and `unclaim` only removes it.
 * - A role is given per call, where the prefix command accepted a list of them.
 * - The list is one embed, since there is no message to page through with an HTTP interaction. It is cut at the
 *   limit of the description of an embed.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:roles')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {}
