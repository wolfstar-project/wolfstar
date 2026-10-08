import { claimPublicRole } from '#lib/structures/commands/publicRoles';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/roles claim`, see the `roles` parent command.
 */
@RegisterAsSubcommand('roles', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:rolesSubcommandClaim') //
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: CommandOptionsRegistry['roles claim']) {
		return claimPublicRole(interaction, options.role, true);
	}
}
