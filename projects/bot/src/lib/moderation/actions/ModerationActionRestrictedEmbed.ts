import { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { TypeVariation } from '#utils/moderationConstants';
import { PermissionFlagsBits } from 'discord-api-types/v10';

export class ModerationActionRestrictedEmbed extends RoleModerationAction<never, TypeVariation.RestrictedEmbed> {
	public constructor() {
		super({
			type: TypeVariation.RestrictedEmbed,
			logPrefix: 'Moderation => RestrictedEmbed',
			roleKey: RoleModerationAction.RoleKey.Embed,
			roleData: { name: 'Embed Restricted', permissions: [], hoist: false, mentionable: false },
			roleOverridesText: PermissionFlagsBits.EmbedLinks,
			roleOverridesVoice: null
		});
	}
}
