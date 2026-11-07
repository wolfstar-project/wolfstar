import { claimPublicRole } from '#lib/structures/commands/publicRoles';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/roles unclaim`, see the `roles` parent command.
 */
@RegisterAsSubcommand('roles', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:rolesSubcommandUnclaim') //
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'roles unclaim'>) {
		return claimPublicRole(interaction, options.role, false);
	}
}
