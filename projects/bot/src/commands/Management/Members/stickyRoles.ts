import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `sticky-roles` subcommands (`add`, `remove`, `reset` and
 * `show`), which are wired onto this command by `@wolfstar/plugin-subcommands-advanced`.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:stickyRoles')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {}
