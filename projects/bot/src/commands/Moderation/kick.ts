import { readSettings } from '#lib/database';
import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { getModeration } from '#utils/functions';
import { TypeVariation, type Unlock } from '#utils/moderationConstants';
import { RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Kick;
type ValueType = Unlock | null;

/**
 * Kicks a member. The command holds a lock while the member remove log is enabled, so the log can tell the removal was a
 * kick once the case exists.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:kick',
		type: TypeVariation.Kick,
		permissions: PermissionFlagsBits.KickMembers
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.Kick, requiredMember: true });
	}

	protected override async preHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters) {
		const settings = await readSettings(interaction.guildId);
		return settings.logsMemberRemove ? { unlock: (await getModeration(context.guild)).createLock() } : null;
	}

	protected override postHandle(_interaction: ModerationCommand.Interaction, { preHandled }: ModerationCommand.PostHandleParameters<ValueType>) {
		preHandled?.unlock();
	}

	protected override async checkTargetCanBeModerated(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	) {
		const member = await super.checkTargetCanBeModerated(interaction, context);
		if (member && !(await member.fetchKickable())) throw context.t('commands/moderation:kickNotKickable');
		return member;
	}
}
