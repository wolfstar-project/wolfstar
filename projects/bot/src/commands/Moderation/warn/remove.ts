import { ModerationActions } from '#lib/moderation/actions';
import { ModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Warning;
type ValueType = null;

/**
 * `/warn remove`, see the `warn` parent command. Removes the last warning of a user, which no longer counts in their
 * history, and tells them if the guild sends the moderation messages.
 *
 * @remarks A warning has nothing to undo on Discord, so it is not active the way a ban is: it is open until it is removed.
 */
@ApplyOptions<ModerationCommand.Options<Type>>({
	requiredMember: false,
	isUndoAction: true,
	type: TypeVariation.Warning,
	actionStatusKey: 'moderation:actionIsNotActiveWarning'
})
@RegisterAsSubcommand('warn', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:warnRemove',
		type: TypeVariation.Warning,
		isUndoAction: true
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {
	protected override isActionActive(_interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		return ModerationActions.warning.hasOpenWarning(context.guild, context.target.id);
	}
}
