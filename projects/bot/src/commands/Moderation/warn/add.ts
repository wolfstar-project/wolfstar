import { ModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Warning;
type ValueType = null;

/**
 * `/warn add`, see the `warn` parent command. Files a warning to a user.
 */
@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, type: TypeVariation.Warning })
@RegisterAsSubcommand('warn', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:warnAdd',
		type: TypeVariation.Warning
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {}
