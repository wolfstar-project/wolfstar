import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { listPublicRoles } from '#lib/structures/commands/publicRoles';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/roles list`, see the `roles` parent command.
 */
@RegisterAsSubcommand('roles', (builder) => applyLocalizedBuilder(builder, 'commands/management:rolesSubcommandList'))
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction) {
		return listPublicRoles(interaction);
	}
}
