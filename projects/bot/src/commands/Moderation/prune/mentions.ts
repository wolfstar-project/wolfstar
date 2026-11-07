import { applyPruneSubcommandBuilder, PruneCommand, type PruneSubcommand } from '#lib/structures/commands/prune';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/prune mentions`, see the `prune` parent command.
 */
@RegisterAsSubcommand('prune', (builder) => applyPruneSubcommandBuilder(builder, 'mentions'))
export class UserCommand extends PruneCommand {
	protected override readonly subcommand = 'mentions' satisfies PruneSubcommand;
}
