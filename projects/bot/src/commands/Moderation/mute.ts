import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `mute` subcommands (`add`, `remove` and `create`), which live in their own classes in the `mute` directory
 * and are wired onto this command by `@wolfstar/plugin-subcommands-advanced`. `create` requires the administrator level.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:mute')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
)
export class UserCommand extends Subcommand {}
