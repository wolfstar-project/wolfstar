import { readSettings } from '#lib/database';
import { getLogger, getModeration } from '#utils/functions';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildBan } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('guildBanRemove')
export class UserListener extends EventGatewayListener<'guildBanRemove'> {
	public async run({ guild, user }: GuildBan) {
		if (!guild?.available) return;

		const settings = await readSettings(guild);
		if (!guild.available || !settings.moderationTrackBans) return;

		// The audit log is asked as soon as possible, the entry may be there before the lock is:
		const logger = await getLogger(guild);
		const controller = new AbortController();
		const contextPromise = logger.unban.wait(user.id, controller.signal).catch(() => null);

		const moderation = await getModeration(guild);
		await moderation.waitLock();

		if (moderation.checkSimilarEntryHasBeenCreated(TypeVariation.Ban, user.id)) {
			controller.abort();
			return;
		}

		const context = await contextPromise;
		// The bot unbanned them itself, and the action makes its own case:
		if (context?.userId === process.env.CLIENT_ID) return;

		await moderation.insert(
			moderation.create({ user, moderator: context?.userId, reason: context?.reason, type: TypeVariation.Ban, metadata: TypeMetadata.Undo })
		);
	}
}
