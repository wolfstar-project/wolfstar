import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * The parent of the `settings` subcommands (`server` and `user`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`.
 *
 * @remarks The command has no default member permissions, since everybody can open their own settings: `server`
 * requires the administrator permission level by itself.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/conf:settings')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {}
