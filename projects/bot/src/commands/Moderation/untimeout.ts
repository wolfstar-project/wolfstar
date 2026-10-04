import { ModerationCommand } from '#lib/moderation';
import { applyModerationBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Timeout;
type ValueType = null;

@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, isUndoAction: true, type: TypeVariation.Timeout })
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:timeoutUndo',
		type: TypeVariation.Timeout,
		isUndoAction: true,
		permissions: PermissionFlagsBits.ModerateMembers
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {}
