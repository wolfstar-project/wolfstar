import { withSharedLock } from '#utils/locks';
import { DiscordAPIError } from '@discordjs/rest';
import { isNullish, isNullishOrEmpty, type Nullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn, type MessageCreateOptions, type WebhookMessageCreateOptions } from '@wolfstar/plugin-gateway';
import { ChannelType, PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { GuildSettingsOfType, ReadonlyGuildData } from 'wolfstar-database';

/**
 * The webhook the logs of a channel are sent through.
 */
export interface LogWebhook {
	id: Snowflake;
	token: string;
}

/**
 * The settings whose channel gets its messages through a webhook when the server turned `logs.webhooks` on.
 *
 * @remarks
 *
 * A log is only sent through a webhook when its key is listed here, so what is edited or replied to after it is sent
 * stays a message of the bot: the bot cannot edit the message of a webhook as its own, and the reports carry
 * components that are replaced when they are closed. `moderationChannel` (the cases, and what the auto-moderation
 * sends there) and `reportsChannel` are therefore left out on purpose.
 */
export const WebhookLogKeys = [
	'logsMemberAdd',
	'logsMemberRemove',
	'logsMemberNicknameUpdate',
	'logsMemberUsernameUpdate',
	'logsMessageDelete',
	'logsMessageDeleteNsfw',
	'logsMessageUpdate',
	'logsMessageUpdateNsfw',
	'logsPrune',
	'logsReactionEmojiAdd',
	'logsReactionEmojiRemove',
	'logsImage',
	'logsRoleCreate',
	'logsRoleUpdate',
	'logsRoleDelete',
	'logsChannelCreate',
	'logsChannelUpdate',
	'logsChannelDelete',
	'logsEmojiCreate',
	'logsEmojiUpdate',
	'logsEmojiDelete',
	'logsServerUpdate',
	'logsInvites',
	'logsThreads',
	'logsEvents',
	'logsExpressions',
	'logsIntegrations',
	'logsBoosts',
	'honeypotLogChannel'
] as const satisfies readonly GuildSettingsOfType<string | Nullish>[];

/**
 * The Redis hash the webhook of each log channel is kept in, by the ID of the channel: `<webhookId>:<token>`.
 *
 * @remarks
 *
 * The token lets anybody who has it post in the channel, so it is not a setting: the settings are read by the
 * dashboard, exported to a file and written to the audit log. A hash is enough for it, as it is for the lockdowns and
 * the warnings of the honeypots. What Redis loses is found again, since the bot is given the token of the webhooks it
 * owns when it lists the ones of a channel ({@linkcode findOwnedLogWebhook}).
 */
const WebhooksHash = 'wolfstar:logs:webhooks';

/**
 * The types of channel that are a thread: the post of a forum is a public thread.
 */
const ThreadTypes: ReadonlySet<ChannelType> = new Set([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);

/**
 * The webhooks this process uses while Redis cannot be asked.
 */
const localWebhooks = new Map<Snowflake, LogWebhook>();

/**
 * How long a channel whose webhook could not be found nor created is left alone, so a channel that already holds the
 * 15 webhooks Discord allows does not cost two failed requests for every log.
 */
const FailureCooldown = 5 * 60_000;

/**
 * The channels whose webhook could not be made, and until when they are not tried again. It is of this process only:
 * another one that tries finds out for itself.
 */
const failures = new Map<Snowflake, number>();

/**
 * Whether the messages of a setting can be sent through a webhook, see {@linkcode WebhookLogKeys}.
 */
export function isWebhookLogKey(key: string): boolean {
	return (WebhookLogKeys as readonly string[]).includes(key);
}

/**
 * Whether a webhook can send a message: it cannot forward nor reply to another one, and it has no stickers.
 */
export function canSendThroughWebhook(message: MessageCreateOptions): boolean {
	return isNullish(message.forward) && isNullish(message.reply) && isNullish(message.message_reference) && !hasStickers(message);
}

function hasStickers(message: MessageCreateOptions) {
	return !isNullishOrEmpty(message.stickers) || !isNullishOrEmpty(message.sticker_ids);
}

/**
 * Where a webhook sends the log of a channel: the webhook is of `channelId`, and `threadId` is the thread it posts in.
 */
export interface LogWebhookTarget {
	channelId: Snowflake;
	threadId?: Snowflake;
}

/**
 * Finds the webhook a log channel is sent through. A webhook belongs to a text or an announcement channel, or to the
 * forum a thread is a post of, and a message is sent to one of their threads with its ID: so the webhook of a thread is
 * the one of its parent.
 *
 * @param channel - The channel of the log.
 * @returns Where to send it, `null` when no webhook can (a channel that is not text, or a thread that has no parent).
 */
export function getLogWebhookTarget(channel: { id: Snowflake; type: ChannelType; parentId?: Snowflake | Nullish }): LogWebhookTarget | null {
	if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) return { channelId: channel.id };
	if (ThreadTypes.has(channel.type) && !isNullish(channel.parentId)) return { channelId: channel.parentId, threadId: channel.id };
	return null;
}

/**
 * The channels the settings of a guild send a log through a webhook to: none when `logs.webhooks` is off.
 *
 * @remarks They are the channels of the settings, so the thread of a log and not the channel its webhook belongs to,
 * which {@linkcode releaseUnusedLogWebhooks} looks up.
 */
export function getLogWebhookChannels(settings: ReadonlyGuildData): Set<Snowflake> {
	const channels = new Set<Snowflake>();
	if (!settings.logsWebhooks) return channels;

	for (const key of WebhookLogKeys) {
		const channelId = settings[key];
		if (!isNullish(channelId)) channels.add(channelId);
	}

	return channels;
}

/**
 * The channels a change of the settings left without a log that uses their webhook: the ones that had one before and
 * have none after. A channel another log still points to is not one of them.
 */
export function getUnusedLogWebhookChannels(before: ReadonlySet<Snowflake>, after: ReadonlySet<Snowflake>): Snowflake[] {
	return [...before].filter((channelId) => !after.has(channelId));
}

/**
 * The channel each one of some channels sends through a webhook of: the parent of a thread, the channel itself for the
 * rest. A channel that cannot be found is its own, it has no webhook that is not its own.
 */
async function resolveLogWebhookChannels(channelIds: Iterable<Snowflake>): Promise<Set<Snowflake>> {
	const resolved = new Set<Snowflake>();
	for (const channelId of channelIds) {
		try {
			const channel = await container.gatewayClient.channels.fetch(channelId);
			const parentId = channel !== null && ThreadTypes.has(channel.type) && 'parentId' in channel ? channel.parentId : null;
			resolved.add(parentId ?? channelId);
		} catch {
			resolved.add(channelId);
		}
	}

	return resolved;
}

/**
 * Deletes the webhooks of the channels a change of the settings left without a log, taking the threads for the channel
 * their webhook belongs to: a webhook is kept while any log is sent to the channel or to one of its threads.
 *
 * @param before - The channels of the logs before the change, see {@linkcode getLogWebhookChannels}.
 * @param after - The channels of the logs after it.
 */
export async function releaseUnusedLogWebhooks(before: ReadonlySet<Snowflake>, after: ReadonlySet<Snowflake>): Promise<void> {
	const left = getUnusedLogWebhookChannels(before, after);
	if (left.length === 0) return;

	const [candidates, kept] = await Promise.all([resolveLogWebhookChannels(left), resolveLogWebhookChannels(after)]);
	const unused = [...candidates].filter((channelId) => !kept.has(channelId));
	if (unused.length > 0) await deleteLogWebhooks(unused);
}

/**
 * Picks, among the webhooks of a channel, the one the bot made: Discord only gives the token of a webhook to the
 * application that owns it, and that is the one the bot can post through.
 *
 * @param webhooks - The webhooks of the channel.
 * @param applicationId - The ID of the application of the bot.
 */
export function findOwnedLogWebhook(
	webhooks: readonly { id: Snowflake; token?: string | Nullish; applicationId?: Snowflake | Nullish }[],
	applicationId: Snowflake
): LogWebhook | null {
	for (const webhook of webhooks) {
		if (webhook.applicationId === applicationId && !isNullishOrEmpty(webhook.token)) return { id: webhook.id, token: webhook.token };
	}

	return null;
}

export async function readLogWebhook(channelId: Snowflake): Promise<LogWebhook | null> {
	const { redis } = container;
	if (redis?.status !== 'ready') return localWebhooks.get(channelId) ?? null;

	const value = await redis.hget(WebhooksHash, channelId);
	if (isNullishOrEmpty(value)) return null;

	// A snowflake has no colon, and the rest is the token whatever it holds:
	const index = value.indexOf(':');
	if (index <= 0 || index === value.length - 1) return null;
	return { id: value.slice(0, index), token: value.slice(index + 1) };
}

async function writeLogWebhook(channelId: Snowflake, webhook: LogWebhook | null) {
	const { redis } = container;
	if (redis?.status !== 'ready') {
		if (webhook === null) localWebhooks.delete(channelId);
		else localWebhooks.set(channelId, webhook);
		return;
	}

	if (webhook === null) await redis.hdel(WebhooksHash, channelId);
	else await redis.hset(WebhooksHash, channelId, `${webhook.id}:${webhook.token}`);
}

/**
 * Gets the webhook of a log channel: the one that is remembered, else the one the bot already owns there, else a new
 * one.
 *
 * @remarks
 *
 * The webhooks of the channel are listed before one is created, so a record that was lost, or a second process, does
 * not pile them up in a channel that holds 15 at most. The whole is done under a lock every process respects, and the
 * record is read again inside it: the process that waited uses what the first one made.
 *
 * Listing and creating both need `Manage Webhooks` in the channel. Without it there is no webhook, and the caller
 * sends a regular message.
 *
 * @param guildId - The ID of the guild of the channel.
 * @param channelId - The ID of the channel.
 * @returns The webhook, or `null` when the channel has none and one cannot be made.
 */
export async function resolveLogWebhook(guildId: Snowflake, channelId: Snowflake): Promise<LogWebhook | null> {
	const known = await readLogWebhook(channelId);
	if (known !== null) return known;

	if ((failures.get(channelId) ?? 0) > Date.now()) return null;
	failures.delete(channelId);

	const { gatewayClient } = container;
	const me = await gatewayClient.members.fetchMe(guildId);
	const permissions = await computePermissionsIn(channelId, me);
	if (!permissions.has(PermissionFlagsBits.ManageWebhooks)) return null;

	return withSharedLock(`log-webhook:${channelId}`, async () => {
		const stored = await readLogWebhook(channelId);
		if (stored !== null) return stored;

		try {
			const webhooks = await gatewayClient.webhooks.fetchChannel(channelId);
			const webhook = findOwnedLogWebhook(webhooks, process.env.CLIENT_ID) ?? (await createLogWebhook(channelId));
			if (webhook !== null) await writeLogWebhook(channelId, webhook);
			return webhook;
		} catch (error) {
			failures.set(channelId, Date.now() + FailureCooldown);
			logFailure('find or create the webhook of', channelId, error);
			return null;
		}
	});
}

async function createLogWebhook(channelId: Snowflake): Promise<LogWebhook | null> {
	const { gatewayClient } = container;
	// The webhook looks like the bot until an administrator gives it another name and avatar:
	const user = gatewayClient.user;
	const webhook = await gatewayClient.webhooks.create(channelId, {
		name: user?.username ?? 'Logs',
		avatar: user?.displayAvatarURL({ size: 256, extension: 'png' }) ?? null,
		reason: 'The logs of this channel are sent through a webhook (logs.webhooks).'
	});

	return isNullishOrEmpty(webhook.token) ? null : { id: webhook.id, token: webhook.token };
}

/**
 * Sends a log through the webhook of its channel.
 *
 * @remarks
 *
 * A webhook that was deleted in Discord (`Unknown Webhook`) is forgotten and looked for, or created, once more, and
 * the message is sent again. Whatever else goes wrong is not retried: the caller sends a regular message, so a log is
 * never lost to its webhook.
 *
 * @param guildId - The ID of the guild of the channel.
 * @param channelId - The ID of the channel the webhook belongs to: the one of the log, or its parent for a thread.
 * @param message - The message of the log, as the channel would be sent it.
 * @param threadId - The thread the log goes to, when the log channel is one. Discord unarchives it.
 * @returns Whether the message was sent.
 */
export async function sendThroughLogWebhook(
	guildId: Snowflake,
	channelId: Snowflake,
	message: MessageCreateOptions,
	threadId?: Snowflake
): Promise<boolean> {
	try {
		const webhook = await resolveLogWebhook(guildId, channelId);
		if (webhook === null) return false;

		const options = toWebhookMessage(message, threadId);
		try {
			await container.gatewayClient.webhooks.send(webhook.id, webhook.token, options);
			return true;
		} catch (error) {
			if (!isUnknownWebhook(error)) throw error;
		}

		// Only the record this process used is dropped: another process may have replaced it already.
		await forgetLogWebhook(channelId, webhook);
		const replacement = await resolveLogWebhook(guildId, channelId);
		if (replacement === null) return false;

		await container.gatewayClient.webhooks.send(replacement.id, replacement.token, options);
		return true;
	} catch (error) {
		logFailure('send a log through the webhook of', channelId, error);
		return false;
	}
}

/**
 * Deletes the webhooks of the channels no log uses anymore, and forgets them.
 *
 * @remarks
 *
 * A webhook is deleted with its own token, which needs no permission. One that cannot be deleted is forgotten all the
 * same: it is found again by listing the webhooks of the channel, should a log go there later.
 *
 * @param channelIds - The channels, see {@linkcode getUnusedLogWebhookChannels}.
 */
export async function deleteLogWebhooks(channelIds: readonly Snowflake[]): Promise<void> {
	for (const channelId of channelIds) {
		try {
			await withSharedLock(`log-webhook:${channelId}`, async () => {
				const webhook = await readLogWebhook(channelId);
				if (webhook === null) return;

				await writeLogWebhook(channelId, null);
				try {
					await container.gatewayClient.webhooks.delete(webhook.id, {
						token: webhook.token,
						reason: 'No log is sent to this channel anymore.'
					});
				} catch (error) {
					// The webhook, or its channel, is already gone:
					if (!isUnknownWebhook(error)) throw error;
				}
			});
		} catch (error) {
			logFailure('delete the webhook of', channelId, error);
		}
	}
}

/**
 * Forgets the webhook of a channel when it is still the given one.
 */
async function forgetLogWebhook(channelId: Snowflake, webhook: LogWebhook) {
	const current = await readLogWebhook(channelId);
	if (current?.id === webhook.id) await writeLogWebhook(channelId, null);
}

/**
 * A webhook that is owned by an application sends components without being asked to. The parameter is set anyway, it
 * is what lets any other webhook send the ones that are not interactive.
 */
function toWebhookMessage(message: MessageCreateOptions, threadId?: Snowflake): WebhookMessageCreateOptions {
	const options = message as WebhookMessageCreateOptions;
	const withThread = isNullish(threadId) ? options : { ...options, threadId };
	return isNullishOrEmpty(message.components) ? withThread : { ...withThread, withComponents: true };
}

function isUnknownWebhook(error: unknown) {
	return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownWebhook;
}

/**
 * Logs a failure without the error itself: the URL of a request made through a webhook holds its token.
 */
function logFailure(action: string, channelId: Snowflake, error: unknown) {
	const reason = error instanceof DiscordAPIError ? `${error.code} (${error.status})` : error instanceof Error ? error.name : 'unknown error';
	container.logger.warn(`[LOG WEBHOOKS] Could not ${action} ${channelId}: ${reason}`);
}
