import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedVoice;
type ValueType = null;

/**
 * `/restrict voice`, see the `restrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedVoice })
@RegisterAsSubcommand('restrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:restrictVoice',
		type: TypeVariation.RestrictedVoice
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
