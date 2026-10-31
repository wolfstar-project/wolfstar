import { HoneypotRoot } from '#lib/moderation/honeypot/commands';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `honeypot` subcommands (`setup`, `edit`, `disable` and `show`), which are wired onto this command
 * by `@wolfstar/plugin-subcommands-advanced`. They manage the honeypot channel, where who writes is caught, see
 * `lib/moderation/honeypot`.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['administrator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, `${HoneypotRoot}:honeypot`)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {}
