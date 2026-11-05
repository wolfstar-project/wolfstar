import { readSettings } from '#lib/database/settings/functions';
import { container } from '@sapphire/framework';
import { DiscordAPIError } from 'discord.js';
import { Routes, type APIWebhook } from 'discord-api-types/v10';
import { WebhookType, type Snowflake } from 'discord-api-types/v10';

/**
 * Reads the announcement channel of the support server of WolfStar, where the updates, the new features and the
 * maintenance notices are published. The `channels.updates` of a server follows it.
 *
 * @remarks
 *
 * It is `UPDATES_ANNOUNCEMENT_CHANNEL_ID`, since each bot follows its own: the alpha `#dev-announcement`, the public
 * one `#announcement`.
 */
export function getUpdatesAnnouncementChannelId(): Snowflake {
	return process.env.UPDATES_ANNOUNCEMENT_CHANNEL_ID ?? '890648971712802906';
}

/**
 * The follow of each server that is still running, so the next one waits for it.
 */
const pendingFollows = new Map<Snowflake, Promise<void>>();

/**
 * Makes the `channels.updates` of a server follow the announcement channel of the updates
 * ({@linkcode getUpdatesAnnouncementChannelId}), so what is published there is posted in the server too, and stops the
 * channel it had before from following it.
 *
 * @remarks
 *
 * A follow is a webhook of the channel that follows, which needs `Manage Webhooks` there. It is not waited for by the
 * write of the settings: a follow that fails is logged, and the setting stays as the server set it. The follows of a
 * server run one after the other, so quick changes (A, then B, then A again) cannot interleave and leave A without one.
 *
 * @param guildId - The server whose setting changed.
 * @param previous - The channel the setting had, `null` when it had none.
 * @param next - The channel the setting has now, `null` when it was removed.
 */
export function syncUpdatesChannelFollow(guildId: Snowflake, previous: Snowflake | null, next: Snowflake | null): Promise<void> {
	if (previous === next) return pendingFollows.get(guildId) ?? Promise.resolve();
	return enqueueFollow(guildId, () => moveFollow(previous, next));
}

/**
 * Runs a follow of a server after the ones it already has waiting.
 */
function enqueueFollow(guildId: Snowflake, run: () => Promise<void>): Promise<void> {
	const follow = (pendingFollows.get(guildId) ?? Promise.resolve()).then(run);
	pendingFollows.set(guildId, follow);
	void follow.finally(() => {
		if (pendingFollows.get(guildId) === follow) pendingFollows.delete(guildId);
	});
	return follow;
}

/**
 * Makes the `channels.updates` the servers already have follow the announcement channel of the updates: a server that
 * set it before the follow existed has none, and a follow that was deleted by hand is made again. It runs once the bot
 * is ready, for the servers it is in, one after the other.
 *
 * @remarks A channel that already follows the announcements is left as it is (see `followUpdates`), so this only costs
 * a read of the webhooks of each channel. The channel is read when the follow of its server runs, not when the servers
 * are listed: one an administrator changed meanwhile is not made to follow again after the change stopped it.
 */
export async function reconcileUpdatesChannelFollows(): Promise<void> {
	const { client, prisma } = container;
	const guilds = await prisma.guild.findMany({ where: { channelsUpdates: { not: null } }, select: { id: true } });

	for (const { id } of guilds) {
		if (!client.guilds.cache.has(id)) continue;

		// After the changes the server has waiting, so it reads what they saved:
		await enqueueFollow(id, async () => {
			const { channelsUpdates } = await readSettings(id);
			if (channelsUpdates !== null) await moveFollow(null, channelsUpdates);
		});
	}
}

async function moveFollow(previous: Snowflake | null, next: Snowflake | null) {
	if (previous !== null) {
		try {
			await unfollowUpdates(previous);
		} catch (error) {
			logFollowError('stop following the updates in', previous, error);
		}
	}

	if (next !== null) {
		try {
			await followUpdates(next);
		} catch (error) {
			logFollowError('follow the updates in', next, error);
		}
	}
}

/**
 * Reads the webhooks of a channel that follow the announcement channel of the updates.
 */
async function fetchUpdatesFollowers(channelId: Snowflake) {
	const webhooks = (await container.client.rest.get(Routes.channelWebhooks(channelId))) as APIWebhook[];
	return webhooks.filter(
		(webhook) => webhook.type === WebhookType.ChannelFollower && webhook.source_channel?.id === getUpdatesAnnouncementChannelId()
	);
}

async function followUpdates(channelId: Snowflake) {
	// A channel that already follows the updates, which an administrator may have done by hand, is not given a second one:
	if ((await fetchUpdatesFollowers(channelId)).length > 0) return;

	await container.client.rest.post(Routes.channelFollowers(getUpdatesAnnouncementChannelId()), {
		body: { webhook_channel_id: channelId },
		reason: 'Set as the updates channel of WolfStar'
	});
}

async function unfollowUpdates(channelId: Snowflake) {
	// Only the follow WolfStar made is removed, one an administrator made by hand is theirs to keep:
	const followers = await fetchUpdatesFollowers(channelId);
	for (const webhook of followers.filter((webhook) => webhook.user?.id === container.client.id)) {
		await container.client.rest.delete(Routes.webhook(webhook.id), { reason: 'No longer the updates channel of WolfStar' });
	}
}

function logFollowError(action: string, channelId: Snowflake, error: unknown) {
	// The channel is gone, or the bot lacks `Manage Webhooks` there: there is nothing to do about it here.
	const reason = error instanceof DiscordAPIError ? `${error.code}: ${error.message}` : error;
	container.logger.warn(`[UPDATES] Could not ${action} the channel ${channelId}:`, reason);
}
