import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `reports` subcommands (`history`, `block` and `unblock`), with which the moderators look at the
 * reports that were made and decide who can make them. They are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`. The members report with the `report` command.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['moderator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/report:reports')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
)
export class UserCommand extends Subcommand {}
