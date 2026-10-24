import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { fetchCaseMemberRoleIds } from '#lib/moderation/common/roles';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';

export class ModerationActionKick extends ModerationAction<never, TypeVariation.Kick> {
	public constructor() {
		super({
			type: TypeVariation.Kick,
			isUndoActionAvailable: false,
			logPrefix: 'Moderation => Kick'
		});
	}

	protected override resolveOptionsExtraData(guild: Guild, options: ModerationAction.PartialOptions) {
		// The member is gone once the action is taken, so the roles are read now for the case to show them:
		return fetchCaseMemberRoleIds(guild, options.user);
	}

	protected override async handleApplyPost(guild: Guild, entry: ModerationAction.Entry) {
		await container.gatewayClient.api.guilds.removeMember(guild.id, entry.userId, { reason: await this.getReason(guild, entry.reason) });
	}
}
