import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `prune` subcommands (`any`, `attachments`, `images`, `author`, `bots`, `humans`, `invites`, `links`, `you`,
 * `pins`, `age`, `includes`, `match`, `startswith`, `endswith`, `mentions` and `embeds`), which live in their own classes in the
 * `prune` directory, share the `PruneCommand` base and are wired onto this command by `@wolfstar/plugin-subcommands-advanced`.
 *
 * @remarks
 *
 * Every subcommand deletes the latest messages of the channel it is run in, and accepts the options of the other ones to
 * combine the filters. Every subcommand requires the moderator permission level.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:prune')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
)
export class UserCommand extends Subcommand {}
