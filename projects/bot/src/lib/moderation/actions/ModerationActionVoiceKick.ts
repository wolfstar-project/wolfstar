import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';

export class ModerationActionVoiceKick extends ModerationAction<never, TypeVariation.VoiceKick> {
	public constructor() {
		super({
			type: TypeVariation.VoiceKick,
			isUndoActionAvailable: false,
			logPrefix: 'Moderation => VoiceKick'
		});
	}

	protected override async handleApplyPost(guild: Guild, entry: ModerationAction.Entry) {
		const reason = await this.getReason(guild, entry.reason);
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { channel_id: null }, { reason });
	}
}
