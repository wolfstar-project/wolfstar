import { ModerationCommand } from '#lib/moderation';
import { applyModerationBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Timeout;
type ValueType = null;

@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, type: TypeVariation.Timeout })
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:timeoutApply',
		type: TypeVariation.Timeout,
		permissions: PermissionFlagsBits.ModerateMembers
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
