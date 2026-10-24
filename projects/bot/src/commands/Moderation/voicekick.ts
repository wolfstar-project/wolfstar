import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.VoiceKick;
type ValueType = null;

/**
 * Disconnects a member from their voice channel.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:voiceKick',
		type: TypeVariation.VoiceKick,
		permissions: PermissionFlagsBits.MoveMembers
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.VoiceKick, requiredMember: true });
	}
}
