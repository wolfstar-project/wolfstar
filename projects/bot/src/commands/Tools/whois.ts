import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * The parent of the `whois` subcommands (`user`, `role` and `server`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/tools:whois')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {}
