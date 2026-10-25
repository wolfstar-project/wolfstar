import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedEmoji;
type ValueType = null;

/**
 * `/restrict emoji`, see the `restrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedEmoji })
@RegisterAsSubcommand('restrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:restrictEmoji',
		type: TypeVariation.RestrictedEmoji
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
