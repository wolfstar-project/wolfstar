import { readSettings } from '#lib/database/settings/functions';
import { canSendThroughWebhook, getLogWebhookTarget, isWebhookLogKey, sendThroughLogWebhook } from '#lib/moderation/logs/webhooks';
import type { AnyChannel, MessageCreateOptions } from '@wolfstar/plugin-gateway';

/**
 * A channel of a guild a log can be sent to.
 */
type LogChannel = Extract<AnyChannel, { send: unknown }> & { guildId: string };

/**
 * Sends the message of a log to its channel: through the webhook of the channel when the server turned `logs.webhooks`
 * on, as a regular message of the bot otherwise.
 *
 * @remarks
 *
 * Every log goes through here (the `LoggerManager` and the `guildMessageLog` listener), so the listeners know nothing
 * of the webhooks. A regular message is also what is sent whenever the webhook cannot be used: the key is not one of
 * `WebhookLogKeys` (the moderation log and the reports), the message is one a webhook cannot send (a forward), the
 * channel is not a text channel, an announcement channel or a thread of one, the bot lacks `Manage Webhooks`, or Discord refused. It throws
 * what the regular message throws, as `channel.send` did.
 *
 * @param channel - The channel of the log.
 * @param key - The setting that holds the channel, which tells what kind of log it is.
 * @param message - The message to send.
 */
export async function sendLogMessage(channel: LogChannel, key: string, message: MessageCreateOptions): Promise<void> {
	const target = isWebhookLogKey(key) && canSendThroughWebhook(message) ? getLogWebhookTarget(channel) : null;
	if (target !== null) {
		const settings = await readSettings(channel.guildId);
		if (settings.logsWebhooks && (await sendThroughLogWebhook(channel.guildId, target.channelId, message, target.threadId))) return;
	}

	await channel.send(message);
}
