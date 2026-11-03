import { resolveOnErrorCodes } from '#common';
import { readHoneypotStats } from '#lib/moderation/honeypot/stats';
import { claimOnce } from '#utils/claims';
import { encodeCustomId } from '@wolfstar/http-framework-utilities';
import { fetchGuildT } from '#lib/moderation/common';
import { Colors } from '#utils/constants';
import { withSharedLock } from '#utils/locks';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ChannelType,
	ComponentType,
	MessageFlags,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	type RESTPostAPIChannelMessageJSONBody,
	type Snowflake,
	ButtonStyle,
	type APIComponentInContainer
} from 'discord-api-types/v10';
import { HoneypotActions, type HoneypotAction } from 'wolfstar-database';

/**
 * The Redis hash the warning of each honeypot is kept in, by the ID of its guild: `<channelId>:<messageId>`.
 */
const NoticesHash = 'wolfstar:honeypot:notices';

/**
 * The warnings this process sent while Redis could not be asked, see {@linkcode readHoneypotNotice}.
 */
const localNotices = new Map<Snowflake, HoneypotNotice>();

/**
 * The warning the bot keeps in a honeypot channel.
 */
export interface HoneypotNotice {
	channelId: Snowflake;
	messageId: Snowflake;
	/**
	 * The action the warning tells about, `null` for a warning sent before it was kept.
	 */
	action: HoneypotAction | null;
}

/**
 * The errors that mean a message is already gone, or that the bot can no longer delete it.
 */
const IgnoredDeleteCodes = [
	RESTJSONErrorCodes.UnknownMessage,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
] as const;

/**
 * What the bot needs in the honeypot channel whatever the action is: to see what is written there, to delete it, and
 * to send its warning.
 */
const ChannelPermissions = {
	ViewChannel: PermissionFlagsBits.ViewChannel,
	SendMessages: PermissionFlagsBits.SendMessages,
	ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
	ManageMessages: PermissionFlagsBits.ManageMessages
} as const;

/**
 * What the bot needs in the channel the catches are reported to, which is what `guildMessageLog` asks for
 * (`canSendEmbeds`) before it sends a log: without them the reports are dropped and nobody is told.
 */
const LogChannelPermissions = {
	ViewChannel: PermissionFlagsBits.ViewChannel,
	SendMessages: PermissionFlagsBits.SendMessages,
	EmbedLinks: PermissionFlagsBits.EmbedLinks
} as const;

/**
 * What each action needs on top of {@linkcode ChannelPermissions}.
 */
const ActionPermissions = {
	Kick: { KickMembers: PermissionFlagsBits.KickMembers },
	Softban: { BanMembers: PermissionFlagsBits.BanMembers },
	Ban: { BanMembers: PermissionFlagsBits.BanMembers }
} as const satisfies Record<HoneypotAction, Record<string, bigint>>;

/**
 * Runs a function while holding the lock of the honeypot of a guild, which every process of the bot respects.
 *
 * @remarks
 *
 * What changes the honeypot (the commands, the upkeep of every day) writes the settings and then changes the channel
 * or its warning, and two of them at once undo each other: a warning sent again by `edit` after `disable` took it off.
 * Each runs whole under this lock, and reads the settings again inside it. It is not the lock of the settings, which
 * `writeSettings` takes inside.
 *
 * @param guildId - The guild of the honeypot.
 * @param callback - What reads the honeypot and changes it.
 */
export function withHoneypotLock<T>(guildId: Snowflake, callback: () => Promise<T>): Promise<T> {
	return withSharedLock(`honeypot:${guildId}`, callback);
}

/**
 * The permissions the bot needs to run the honeypot in a channel and does not have.
 *
 * @param guildId - The guild of the channel.
 * @param channelId - The honeypot channel.
 * @param action - What is done to who writes in the channel, which needs a permission of its own.
 * @returns Their names, none when the bot has them all, or `null` when the channel is not one of the guild.
 */
export function getMissingHoneypotPermissions(guildId: Snowflake, channelId: Snowflake, action: HoneypotAction): Promise<string[] | null> {
	return getMissingChannelPermissions(guildId, channelId, { ...ChannelPermissions, ...ActionPermissions[action] });
}

/**
 * The permissions the bot needs to run the honeypot in a channel it creates and does not have in the guild. A new
 * channel has no overwrites, so what the bot can do in it is what it can do in the guild.
 *
 * @remarks It is asked before the channel is created: a channel the honeypot cannot run in would be left behind, and
 * the next attempt would create another.
 *
 * @param guildId - The guild the channel would be created in.
 * @param action - What is done to who writes in the channel, which needs a permission of its own.
 * @returns Their names, none when the bot has them all.
 */
export async function getMissingHoneypotGuildPermissions(guildId: Snowflake, action: HoneypotAction): Promise<string[]> {
	const me = await container.gatewayClient.members.fetchMe(guildId);
	const permissions = await me.fetchPermissions();
	return Object.entries({ ...ChannelPermissions, ...ActionPermissions[action] })
		.filter(([, bit]) => !permissions.has(bit))
		.map(([name]) => name);
}

/**
 * The permissions the bot needs to report the catches to a channel and does not have.
 *
 * @param guildId - The guild of the channel.
 * @param channelId - The channel of `honeypot.log-channel`.
 * @returns Their names, none when the bot has them all, or `null` when the channel is not one of the guild.
 */
export function getMissingHoneypotLogPermissions(guildId: Snowflake, channelId: Snowflake): Promise<string[] | null> {
	return getMissingChannelPermissions(guildId, channelId, LogChannelPermissions);
}

async function getMissingChannelPermissions(guildId: Snowflake, channelId: Snowflake, required: Record<string, bigint>): Promise<string[] | null> {
	const { gatewayClient } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !('guildId' in channel) || channel.guildId !== guildId) return null;

	const permissions = await computePermissionsIn(channel, await gatewayClient.members.fetchMe(guildId));
	return Object.entries(required)
		.filter(([, bit]) => !permissions.has(bit))
		.map(([name]) => name);
}

/**
 * Creates the channel of the honeypot, at the top of the list of the guild: the bots that post in every channel start
 * there.
 *
 * @param guildId - The guild to create the channel in.
 * @returns The ID of the channel, or `null` when the bot cannot create channels.
 */
export async function createHoneypotChannel(guildId: Snowflake): Promise<Snowflake | null> {
	const t = await fetchGuildT({ id: guildId });
	const channel = await resolveOnErrorCodes(
		container.gatewayClient.api.guilds.createChannel(
			guildId,
			{ name: t('commands/honeypot:channelName'), type: ChannelType.GuildText, topic: t('commands/honeypot:channelTopic'), position: 0 },
			{ reason: 'Honeypot' }
		),
		RESTJSONErrorCodes.MissingPermissions,
		RESTJSONErrorCodes.MissingAccess
	);
	return channel?.id ?? null;
}

/**
 * Deletes a channel `/honeypot setup` created and that did not become the honeypot, so a setup that fails leaves
 * nothing behind.
 *
 * @param channelId - The channel that was just created.
 */
export async function deleteHoneypotChannel(channelId: Snowflake): Promise<void> {
	await resolveOnErrorCodes(
		container.gatewayClient.api.channels.delete(channelId, { reason: 'Honeypot' }),
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.MissingPermissions,
		RESTJSONErrorCodes.MissingAccess
	);
}

/**
 * Builds the warning the bot keeps in the honeypot channel, which says what happens to who writes there.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param action - What is done to who writes in the channel.
 */
export function renderHoneypotNotice(t: TFunction<AnyNamespace>, action: HoneypotAction, stats?: { guildId: Snowflake; catches: number }) {
	const content = t('commands/honeypot:notice', {
		title: t('commands/honeypot:noticeTitle'),
		description: t('commands/honeypot:noticeDescription'),
		consequence: t(`commands/honeypot:notice${action}`)
	});

	// The count of the catches is a button, which answers with the numbers of the honeypot, as the one of RiskyMH does:
	const counter: APIComponentInContainer[] =
		stats === undefined
			? []
			: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								style: ButtonStyle.Secondary,
								label: t('commands/honeypot:noticeCatches', { count: stats.catches }),
								emoji: { name: '🍯' },
								custom_id: encodeCustomId(HoneypotStatsHandlerName, stats.guildId, 'show')
							}
						]
					}
				];

	return {
		components: [
			{ type: ComponentType.Container, accent_color: Colors.Red, components: [{ type: ComponentType.TextDisplay, content }, ...counter] }
		],
		flags: MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	} satisfies RESTPostAPIChannelMessageJSONBody;
}

/**
 * The name of the interaction handler of the `Catches` button of the warning, which is also the first part of its
 * custom ID: `honeypotStats.<guildId>.show`.
 */
const HoneypotStatsHandlerName = 'honeypotStats';

/**
 * Writes the count of the catches into the warning of the honeypot of a guild, where it is, after a catch. The edit is
 * made once every few seconds at most (`claimOnce`), so a raid does not edit the message for each of its bots; the
 * count a burst leaves behind is put right by the next catch, or by the upkeep. A warning that is gone is forgotten.
 */
export async function updateHoneypotNoticeCount(guildId: Snowflake): Promise<void> {
	// The claim comes first, so the read of every warning (a hash of all the guilds) is made once every few seconds
	// for a guild, whatever the size of the raid:
	if (!(await claimOnce(`honeypot-notice:${guildId}`, 5))) return;

	const notices = [...(await readHoneypotNotices())]
		.filter(([key]) => key === guildId || key.startsWith(`${guildId}:`))
		.map(([, notice]) => notice);
	if (notices.length === 0) return;

	const [t, stats] = await Promise.all([fetchGuildT({ id: guildId }), readHoneypotStats(guildId)]);
	for (const notice of notices) {
		if (notice.action === null) continue;
		const edited = await resolveOnErrorCodes(
			container.gatewayClient.api.channels.editMessage(
				notice.channelId,
				notice.messageId,
				renderHoneypotNotice(t, notice.action, { guildId, catches: stats.total })
			),
			RESTJSONErrorCodes.UnknownMessage,
			RESTJSONErrorCodes.UnknownChannel,
			RESTJSONErrorCodes.MissingAccess,
			RESTJSONErrorCodes.MissingPermissions
		);
		if (edited === null)
			container.logger.debug(
				`[Honeypot] Could not write the count of the catches into the warning ${notice.messageId} of the guild ${guildId}`
			);
	}
}

/**
 * Reads which message is the warning of the honeypot of a guild.
 *
 * @remarks
 *
 * The warning is tracked by its ID, so it is the only message the bot ever deletes for it: the channel may be one the
 * server already had, with other messages of the bot in it. The ID is in Redis ({@linkcode NoticesHash}), as the
 * lockdowns are, and not in the settings: it is not something a server configures, and the table of the honeypot would
 * need a column and a migration for it. Without a ready connection this process remembers the warnings it sent.
 *
 * @param guildId - The guild of the honeypot.
 * @returns The warning, or `null` when the honeypot has none.
 */
export async function readHoneypotNotice(guildId: Snowflake, channelId?: Snowflake): Promise<HoneypotNotice | null> {
	const { redis } = container;
	const key = channelId ? `${guildId}:${channelId}` : guildId;
	if (redis?.status !== 'ready') return localNotices.get(key) ?? null;

	const value = await redis.hget(NoticesHash, key);
	return value === null ? null : parseHoneypotNotice(value);
}

/**
 * Reads the warning of every honeypot this process can know of: the ones of Redis, or the ones it sent itself without
 * a ready connection, by the ID of their guild.
 */
export async function readHoneypotNotices(): Promise<Map<Snowflake, HoneypotNotice>> {
	const { redis } = container;
	if (redis?.status !== 'ready') return new Map(localNotices);

	const values = await redis.hgetall(NoticesHash);
	return new Map(Object.entries(values).map(([guildId, value]) => [guildId, parseHoneypotNotice(value)]));
}

/**
 * Reads a warning as Redis keeps it: `<channelId>:<messageId>:<action>`, the action left out by the warnings sent
 * before it was kept.
 */
function parseHoneypotNotice(value: string): HoneypotNotice {
	const [channelId, messageId, action] = value.split(':');
	return { channelId, messageId, action: (HoneypotActions as readonly string[]).includes(action) ? (action as HoneypotAction) : null };
}

async function writeHoneypotNotice(guildId: Snowflake, notice: HoneypotNotice | null): Promise<void> {
	const { redis } = container;
	if (redis?.status !== 'ready') {
		if (notice === null) localNotices.delete(guildId);
		else localNotices.set(guildId, notice);
		return;
	}

	if (notice === null) await redis.hdel(NoticesHash, guildId);
	else await redis.hset(NoticesHash, guildId, `${notice.channelId}:${notice.messageId}:${notice.action ?? ''}`);
}

function deleteHoneypotNoticeMessage(notice: HoneypotNotice) {
	return resolveOnErrorCodes(container.gatewayClient.messages.delete(notice.channelId, notice.messageId, 'Honeypot'), ...IgnoredDeleteCodes);
}

/**
 * Takes the warning of the honeypot of a guild off its channel, wherever it is, and forgets it.
 *
 * @param guildId - The guild of the honeypot.
 */
export async function removeHoneypotNotice(guildId: Snowflake, channelId?: Snowflake): Promise<void> {
	const notice = await readHoneypotNotice(guildId, channelId);
	if (notice === null) return;

	await deleteHoneypotNoticeMessage(notice);
	await writeHoneypotNotice(channelId ? `${guildId}:${channelId}` : guildId, null);
	container.logger.debug(`[Honeypot] The warning ${notice.messageId} of the guild ${guildId} was taken off the channel ${notice.channelId}`);
}

/**
 * Sends the warning of the honeypot to its channel again when the guild wants one, in the place of the one it had, and
 * only takes the old one off when it wants none.
 *
 * @remarks
 *
 * The new warning is sent before the old one is deleted: when it cannot be sent (the bot lost a permission) the
 * channel keeps the warning it had, since it still acts on who writes there. The old one is the message
 * {@linkcode readHoneypotNotice} tracks and nothing else, and it goes wherever it is: a honeypot that moved to another
 * channel leaves no warning in the one it left, which is not a trap anymore. A new message also makes the channel the
 * latest one that had activity.
 *
 * @param guildId - The guild of the channel.
 * @param channelId - The honeypot channel.
 * @param options - Whether a warning is sent, and the action it tells about.
 * @returns Whether the channel has the warning the guild wants, `false` when it could not be sent.
 */
export async function refreshHoneypotNotice(
	guildId: Snowflake,
	channelId: Snowflake,
	options: { warning: boolean; action: HoneypotAction; independent?: boolean }
): Promise<boolean> {
	if (!options.warning) {
		await removeHoneypotNotice(guildId, options.independent ? channelId : undefined);
		return true;
	}

	const previous = await readHoneypotNotice(guildId, options.independent ? channelId : undefined);
	const t = await fetchGuildT({ id: guildId });
	const stats = await readHoneypotStats(guildId);
	const sent = await resolveOnErrorCodes(
		container.gatewayClient.api.channels.createMessage(channelId, renderHoneypotNotice(t, options.action, { guildId, catches: stats.total })),
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.MissingAccess,
		RESTJSONErrorCodes.MissingPermissions
	);
	if (sent === null) {
		container.logger.debug(`[Honeypot] Could not send the warning to the channel ${channelId} of the guild ${guildId}`);
		// The warning of another channel tells about a trap that is not there anymore, so it goes all the same:
		if (previous !== null && previous.channelId !== channelId) await removeHoneypotNotice(guildId);
		return false;
	}

	await writeHoneypotNotice(options.independent ? `${guildId}:${channelId}` : guildId, { channelId, messageId: sent.id, action: options.action });
	if (previous !== null) await deleteHoneypotNoticeMessage(previous);
	container.logger.debug(`[Honeypot] The warning ${sent.id} was sent to the channel ${channelId} of the guild ${guildId}`);
	return true;
}
