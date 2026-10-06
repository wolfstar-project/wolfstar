import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedEmoji;
type ValueType = null;

/**
 * `/unrestrict emoji`, see the `unrestrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedEmoji, isUndoAction: true })
@RegisterAsSubcommand('unrestrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:unrestrictEmoji',
		type: TypeVariation.RestrictedEmoji,
		isUndoAction: true
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
