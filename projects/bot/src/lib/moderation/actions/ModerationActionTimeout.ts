import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { days, resolveOnErrorCodes } from '#utils/common';
import { getLogger } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

export class ModerationActionTimeout extends ModerationAction<never, TypeVariation.Timeout> {
	public constructor() {
		super({
			type: TypeVariation.Timeout,
			isUndoActionAvailable: true,
			maximumDuration: days(28),
			durationRequired: true,
			durationExternal: true,
			logPrefix: 'Moderation => Timeout'
		});
	}

	public override async isActive(guild: Guild, userId: Snowflake) {
		const member = await resolveOnErrorCodes(container.gatewayClient.members.fetch(guild.id, userId), RESTJSONErrorCodes.UnknownMember);
		return !isNullish(member) && member.isCommunicationDisabled();
	}

	protected override async handleApplyPre(guild: Guild, entry: ModerationAction.Entry) {
		const reason = await this.getReason(guild, entry.reason);
		const time = new Date(Date.now() + entry.duration!).toISOString();
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { communication_disabled_until: time }, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}

	protected override handleApplyPreOnStart(guild: Guild, entry: ModerationAction.Entry) {
		getLogger(guild).timeout.set(entry.userId, { userId: entry.moderatorId, reason: entry.reason });
	}

	protected override handleApplyPreOnError(_error: Error, guild: Guild, entry: ModerationAction.Entry) {
		getLogger(guild).timeout.unset(entry.userId);
	}

	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry) {
		const reason = await this.getReason(guild, entry.reason, true);
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { communication_disabled_until: null }, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}

	protected override handleUndoPreOnStart(guild: Guild, entry: ModerationAction.Entry) {
		getLogger(guild).timeout.set(entry.userId, { userId: entry.moderatorId, reason: entry.reason });
	}

	protected override handleUndoPreOnError(_error: Error, guild: Guild, entry: ModerationAction.Entry) {
		getLogger(guild).timeout.unset(entry.userId);
	}
}
