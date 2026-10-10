import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { resolveOnErrorCodes } from '#common';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

export class ModerationActionBan extends ModerationAction<number, TypeVariation.Ban> {
	public constructor() {
		super({
			type: TypeVariation.Ban,
			isUndoActionAvailable: true,
			logPrefix: 'Moderation => Ban'
		});
	}

	public override async isActive(guild: Guild, userId: Snowflake) {
		const ban = await resolveOnErrorCodes(guild.bans.fetch(userId, { force: true, cache: false }), RESTJSONErrorCodes.UnknownBan);
		return !isNullish(ban);
	}

	protected override async handleApplyPost(guild: Guild, entry: ModerationAction.Entry, data: ModerationAction.Data<number>) {
		const reason = await this.getReason(guild, entry.reason);
		await container.gatewayClient.api.guilds.banUser(guild.id, entry.userId, { delete_message_seconds: data.context ?? 0 }, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}

	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry) {
		const reason = await this.getReason(guild, entry.reason, true);
		await container.gatewayClient.api.guilds.unbanUser(guild.id, entry.userId, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}
}
