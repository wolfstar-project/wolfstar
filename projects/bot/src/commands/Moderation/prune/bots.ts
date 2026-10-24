import { applyPruneSubcommandBuilder, PruneCommand, type PruneSubcommand } from '#lib/structures/commands/prune';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/prune bots`, see the `prune` parent command.
 */
@RegisterAsSubcommand('prune', (builder) => applyPruneSubcommandBuilder(builder, 'bots'))
export class UserCommand extends PruneCommand {
	protected override readonly subcommand = 'bots' satisfies PruneSubcommand;
}
