import { readSettings } from '#lib/database';
import { fetchCaseMemberRoleIds } from '#lib/moderation/common/roles';
import { getLogger, getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildBan } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('guildBanAdd')
export class UserListener extends EventGatewayListener<'guildBanAdd'> {
	public async run({ guild, user }: GuildBan) {
		if (!guild?.available) return;

		const settings = await readSettings(guild);
		if (!guild.available || !settings.moderationTrackBans) return;

		// The audit log is asked as soon as possible, the entry may be there before the lock is:
		const logger = await getLogger(guild);
		const controller = new AbortController();
		const contextPromise = logger.ban.wait(user.id, controller.signal).catch(() => null);

		const moderation = await getModeration(guild);
		await moderation.waitLock();

		if (moderation.checkSimilarEntryHasBeenCreated(TypeVariation.Ban, user.id)) {
			controller.abort();
			return;
		}

		const context = await contextPromise;
		// The bot banned them itself, and the action makes its own case:
		if (context?.userId === process.env.CLIENT_ID) return;

		// A ban made in Discord keeps the roles too, when the member is still cached:
		const extraData = await fetchCaseMemberRoleIds(guild, user.id);
		await moderation.insert(
			moderation.create({ user: user.id, moderator: context?.userId, reason: context?.reason, type: TypeVariation.Ban, extraData })
		);
	}
}
