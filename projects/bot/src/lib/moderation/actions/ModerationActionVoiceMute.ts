import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { resolveOnErrorCodes } from '#utils/common';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

export class ModerationActionVoiceMute extends ModerationAction<never, TypeVariation.VoiceMute> {
	public constructor() {
		super({
			type: TypeVariation.VoiceMute,
			isUndoActionAvailable: true,
			logPrefix: 'Moderation => VoiceMute'
		});
	}

	public override async isActive(guild: Guild, userId: Snowflake) {
		const member = await resolveOnErrorCodes(container.gatewayClient.members.fetch(guild.id, userId), RESTJSONErrorCodes.UnknownMember);
		if (member === null) return false;

		// The voice state is `null` when the member is not connected (or not cached), use the server-wide mute flag
		// of the member as a fallback:
		const voice = await member.fetchVoiceState();
		return voice?.serverMute ?? member.mute;
	}

	protected override async handleApplyPre(guild: Guild, entry: ModerationAction.Entry) {
		const reason = await this.getReason(guild, entry.reason);
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { mute: true }, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}

	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry) {
		const reason = await this.getReason(guild, entry.reason, true);
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { mute: false }, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}
}
