import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedEmbed;
type ValueType = null;

/**
 * `/restrict embed`, see the `restrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedEmbed })
@RegisterAsSubcommand('restrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:restrictEmbed',
		type: TypeVariation.RestrictedEmbed
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
