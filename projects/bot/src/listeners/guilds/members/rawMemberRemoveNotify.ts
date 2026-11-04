import { renderMemberEvent } from '#lib/moderation/logs/members';
import { readSettings } from '#lib/database';
import { fetchGuildT, fetchMemberRoleIds, formatRoleMentions } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { getLogger, getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatchData) {
		const occurredAt = Date.now();
		const settings = await readSettings(guild);
		const targetChannelId = settings.logsMemberRemove;
		if (isNullish(targetChannelId)) return;

		const isModerationAction = await this.isModerationAction(guild, user);

		const t = await fetchGuildT(guild);
		const type = isModerationAction.kicked
			? 'kicked'
			: isModerationAction.banned
				? 'banned'
				: isModerationAction.softbanned
					? 'softbanned'
					: 'left';
		// The gateway no longer has the roles of the member, they come from the member the cache held:
		const roles = formatRoleMentions(t, await fetchMemberRoleIds(member));
		const logger = await getLogger(guild);
		await logger.send({
			key: 'logsMemberRemove',
			channelId: targetChannelId,
			makeMessage: () => renderMemberEvent(t, user, user.flags ?? 0, { type, joinedAt: member?.joinedTimestamp ?? null, roles }, occurredAt)
		});
	}

	private async isModerationAction(guild: Guild, user: GatewayGuildMemberRemoveDispatchData['user']): Promise<IsModerationAction> {
		const moderation = await getModeration(guild);
		await moderation.waitLock();

		const latestLogForUser = moderation.getLatestRecentCachedEntryForUser(user.id);

		if (latestLogForUser === null) {
			return {
				kicked: false,
				banned: false,
				softbanned: false
			};
		}

		return {
			kicked: latestLogForUser.type === TypeVariation.Kick,
			banned: latestLogForUser.type === TypeVariation.Ban,
			softbanned: latestLogForUser.type === TypeVariation.Softban
		};
	}
}

interface IsModerationAction {
	readonly kicked: boolean;
	readonly banned: boolean;
	readonly softbanned: boolean;
}
