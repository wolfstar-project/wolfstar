import { applyPruneSubcommandBuilder, PruneCommand, type PruneSubcommand } from '#lib/structures/commands/prune';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/prune startswith`, see the `prune` parent command.
 */
@RegisterAsSubcommand('prune', (builder) => applyPruneSubcommandBuilder(builder, 'startswith'))
export class UserCommand extends PruneCommand {
	protected override readonly subcommand = 'startswith' satisfies PruneSubcommand;
}
