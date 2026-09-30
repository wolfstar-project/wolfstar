import { readSettings } from '#lib/database';
import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { getModeration } from '#utils/functions';
import { TypeVariation, type Unlock } from '#utils/moderationConstants';
import { RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Ban;
type ValueType = Unlock | null;

/**
 * Unbans a user. `moderationTrackBans` replaces the `events.ban-remove` setting, see the `ban` command.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:unban',
		type: TypeVariation.Ban,
		isUndoAction: true,
		permissions: PermissionFlagsBits.BanMembers
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.Ban, isUndoAction: true, requiredMember: false });
	}

	protected override async preHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters) {
		const settings = await readSettings(interaction.guildId);
		return settings.moderationTrackBans ? { unlock: getModeration(context.guild).createLock() } : null;
	}

	protected override postHandle(_interaction: ModerationCommand.Interaction, { preHandled }: ModerationCommand.PostHandleParameters<ValueType>) {
		preHandled?.unlock();
	}
}
