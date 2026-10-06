import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `restrict` subcommands (`attachment`, `embed`, `emoji`, `reaction` and `voice`), which live in their own
 * classes next to this file (`restrict<Type>.ts`) and are wired onto this command by `@wolfstar/plugin-subcommands-advanced`.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:restrict')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
)
export class UserCommand extends Subcommand {}
