import { applyPruneSubcommandBuilder, PruneCommand, type PruneSubcommand } from '#lib/structures/commands/prune';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/prune humans`, see the `prune` parent command.
 */
@RegisterAsSubcommand('prune', (builder) => applyPruneSubcommandBuilder(builder, 'humans'))
export class UserCommand extends PruneCommand {
	protected override readonly subcommand = 'humans' satisfies PruneSubcommand;
}
