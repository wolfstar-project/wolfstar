import { ModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Timeout;
type ValueType = null;

/**
 * `/timeout remove`, see the `timeout` parent command.
 */
@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, isUndoAction: true, type: TypeVariation.Timeout })
@RegisterAsSubcommand('timeout', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:timeoutRemove',
		type: TypeVariation.Timeout,
		isUndoAction: true
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {}
