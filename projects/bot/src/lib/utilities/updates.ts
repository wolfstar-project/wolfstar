import { container } from '@wolfstar/http-framework';
import { DiscordAPIError } from '@discordjs/rest';
import { WebhookType, type Snowflake } from 'discord-api-types/v10';

/**
 * The announcement channel of the support server of WolfStar (`830481105261821952`), where the updates, the new
 * features and the maintenance notices are published. The `updates-channel` of a server follows it.
 */
export const UpdatesAnnouncementChannelId: Snowflake = '890648971712802906';

/**
 * Makes the `updates-channel` of a server follow {@linkcode UpdatesAnnouncementChannelId}, so what is published there
 * is posted in the server too, and stops the channel it had before from following it.
 *
 * @remarks
 *
 * A follow is a webhook of the channel that follows, which needs `Manage Webhooks` there. It is not waited for by the
 * write of the settings: a follow that fails is logged, and the setting stays as the server set it.
 *
 * @param previous - The channel the setting had, `null` when it had none.
 * @param next - The channel the setting has now, `null` when it was removed.
 */
export async function syncUpdatesChannelFollow(previous: Snowflake | null, next: Snowflake | null): Promise<void> {
	if (previous === next) return;

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
 * Reads the webhooks of a channel that follow {@linkcode UpdatesAnnouncementChannelId}.
 */
async function fetchUpdatesFollowers(channelId: Snowflake) {
	const webhooks = await container.gatewayClient.api.channels.getWebhooks(channelId);
	return webhooks.filter((webhook) => webhook.type === WebhookType.ChannelFollower && webhook.source_channel?.id === UpdatesAnnouncementChannelId);
}

async function followUpdates(channelId: Snowflake) {
	// A channel that already follows the updates, which an administrator may have done by hand, is not given a second one:
	if ((await fetchUpdatesFollowers(channelId)).length > 0) return;

	await container.gatewayClient.api.channels.followAnnouncements(UpdatesAnnouncementChannelId, channelId, {
		reason: 'Set as the updates channel of WolfStar'
	});
}

async function unfollowUpdates(channelId: Snowflake) {
	for (const webhook of await fetchUpdatesFollowers(channelId)) {
		await container.gatewayClient.api.webhooks.delete(webhook.id, { reason: 'No longer the updates channel of WolfStar' });
	}
}

function logFollowError(action: string, channelId: Snowflake, error: unknown) {
	// The channel is gone, or the bot lacks `Manage Webhooks` there: there is nothing to do about it here.
	const reason = error instanceof DiscordAPIError ? `${error.code}: ${error.message}` : error;
	container.logger.warn(`[UPDATES] Could not ${action} the channel ${channelId}:`, reason);
}
