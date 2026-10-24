import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `role-rules` subcommands (`add`, `remove` and `list`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`. They manage the roles that are given or taken by the other roles of a
 * member, see `lib/roles/rules`.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['administrator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/role-rules:roleRules')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
)
export class UserCommand extends Subcommand {}
