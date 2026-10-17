import { applyPruneSubcommandBuilder, PruneCommand, type PruneSubcommand } from '#lib/structures/commands/prune';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/prune invites`, see the `prune` parent command.
 */
@RegisterAsSubcommand('prune', (builder) => applyPruneSubcommandBuilder(builder, 'invites'))
export class UserCommand extends PruneCommand {
	protected override readonly subcommand = 'invites' satisfies PruneSubcommand;
}
