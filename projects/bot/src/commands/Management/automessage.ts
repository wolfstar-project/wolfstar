import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `automessage` subcommands (`enable`, `disable` and `list`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`. They send a message in a channel again every interval, see
 * `lib/automessages`.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['administrator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/auto-messages:automessage')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {}
