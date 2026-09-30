import { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { TypeVariation } from '#utils/moderationConstants';
import { PermissionFlagsBits } from 'discord-api-types/v10';

export class ModerationActionRestrictedAttachment extends RoleModerationAction<never, TypeVariation.RestrictedAttachment> {
	public constructor() {
		super({
			type: TypeVariation.RestrictedAttachment,
			logPrefix: 'Moderation => RestrictedAttachment',
			roleKey: RoleModerationAction.RoleKey.Attachment,
			roleData: { name: 'Attachment Restricted', permissions: [], hoist: false, mentionable: false },
			roleOverridesText: PermissionFlagsBits.AttachFiles,
			roleOverridesVoice: null
		});
	}
}
