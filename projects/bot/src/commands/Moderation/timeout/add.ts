import { ModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Timeout;
type ValueType = null;

/**
 * `/timeout add`, see the `timeout` parent command.
 */
@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, type: TypeVariation.Timeout })
@RegisterAsSubcommand('timeout', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:timeoutAdd',
		type: TypeVariation.Timeout
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {
	protected override async checkTargetCanBeModerated(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	) {
		const member = await super.checkTargetCanBeModerated(interaction, context);
		if (member && !(await member.fetchModeratable())) throw context.t('commands/moderation:timeoutNotModeratable');
		return member;
	}
}
