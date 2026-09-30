import { SetUpModerationCommand } from '#lib/moderation';
import { applyModerationBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions, RegisterCommand } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Mute;
type ValueType = null;

@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.Mute })
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:mute',
		type: TypeVariation.Mute,
		permissions: PermissionFlagsBits.ManageRoles
	})
)
export class UserSetUpModerationCommand extends SetUpModerationCommand<Type, ValueType> {}
