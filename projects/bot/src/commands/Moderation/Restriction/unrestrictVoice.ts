import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/http-framework';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedVoice;
type ValueType = null;

/**
 * `/unrestrict voice`, see the `unrestrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedVoice, isUndoAction: true })
@RegisterAsSubcommand('unrestrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:unrestrictVoice',
		type: TypeVariation.RestrictedVoice,
		isUndoAction: true
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
