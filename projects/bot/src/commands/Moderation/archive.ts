import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `archive` subcommands (`create`, `list` and `show`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`. They save and read the recent messages of members, see
 * `lib/moderation/histories`.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['moderator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/archive:archive')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
)
export class UserCommand extends Subcommand {}
