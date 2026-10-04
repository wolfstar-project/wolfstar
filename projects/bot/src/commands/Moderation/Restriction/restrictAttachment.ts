import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedAttachment;
type ValueType = null;

/**
 * `/restrict attachment`, see the `restrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedAttachment })
@RegisterAsSubcommand('restrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:restrictAttachment',
		type: TypeVariation.RestrictedAttachment
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
