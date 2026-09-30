import { applyModerationSubcommandBuilder, SetUpModerationCommand } from '#lib/moderation';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/http-framework';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.RestrictedEmbed;
type ValueType = null;

/**
 * `/unrestrict embed`, see the `unrestrict` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.RestrictedEmbed, isUndoAction: true })
@RegisterAsSubcommand('unrestrict', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:unrestrictEmbed',
		type: TypeVariation.RestrictedEmbed,
		isUndoAction: true
	})
)
export class UserCommand extends SetUpModerationCommand<Type, ValueType> {}
