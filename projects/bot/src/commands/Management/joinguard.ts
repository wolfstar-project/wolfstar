import { JoinGuardRoot } from '#lib/moderation/joinguard/commands';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `joinguard` subcommands (`show`, `post-button`, `enable` and `disable`), which are wired onto this
 * command by `@wolfstar/plugin-subcommands-advanced`. The join guard stops the members whose account looks like a raid
 * or a spam bot when they join, see `lib/moderation/joinguard`; its rules are edited on the dashboard.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['administrator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, `${JoinGuardRoot}:joinguard`)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {}
