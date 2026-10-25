import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedReaction;
type ValueType = null;

/**
 * `/unrestrict reaction`, see the `unrestrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedReaction, isUndoAction: true })
@RegisterAsSubcommand('unrestrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:unrestrictReaction',
		type: TypeVariation.RestrictedReaction,
		isUndoAction: true
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
