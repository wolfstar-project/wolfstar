import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/http-framework';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedAttachment;
type ValueType = null;

/**
 * `/unrestrict attachment`, see the `unrestrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedAttachment, isUndoAction: true })
@RegisterAsSubcommand('unrestrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:unrestrictAttachment',
		type: TypeVariation.RestrictedAttachment,
		isUndoAction: true
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
