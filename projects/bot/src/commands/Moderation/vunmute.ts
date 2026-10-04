import { ModerationCommand } from '#lib/moderation';
import { applyModerationBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.VoiceMute;
type ValueType = null;

@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, isUndoAction: true, type: TypeVariation.VoiceMute })
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:vunmute',
		type: TypeVariation.VoiceMute,
		isUndoAction: true,
		permissions: PermissionFlagsBits.MuteMembers
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {}
