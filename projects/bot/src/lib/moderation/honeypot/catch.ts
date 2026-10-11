import { floatPromise, resolveGuild, resolveOnErrorCodes, seconds } from '#common';
import { fetchUserReportEnabled } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import { fetchGuildT } from '#lib/moderation/common';
import { renderHoneypotLog } from '#lib/moderation/honeypot/log';
import type { GuildMessage } from '#lib/types';
import { Events } from '#lib/types/Enums';
import { getModeration, isModerator } from '#utils/functions';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild, User } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { HoneypotAction, ReadonlyGuildData } from 'wolfstar-database';

/**
 * How far back a softban or a ban of the honeypot deletes what the member sent, in every channel. A bot writes in the
 * other channels at the same time, so its messages there go with it.
 */
export const HoneypotDeleteMessageSeconds = seconds.fromHours(1);

/**
 * How long a member who was caught is not acted on again. A bot sends several messages in a row, and each would make a
 * case of its own.
 */
const ClaimSeconds = 60;

/**
 * The errors that mean the message is already gone, or that the bot cannot delete it.
 */
const IgnoredDeleteCodes = [
	RESTJSONErrorCodes.UnknownMessage,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
] as const;

/**
 * Catches who wrote in the honeypot channel of a guild: the message is deleted, the action the guild chose is taken on
 * its author, which makes a case as the moderation commands do, and the catch is reported to the channel of
 * `honeypot.log-channel`.
 *
 * @remarks
 *
 * The moderators are never caught, their messages are left where they are. An action that cannot be taken (the member
 * is above the bot, the bot lacks the permission) is reported as well, and the message is deleted all the same.
 *
 * @param message - A message a member sent in the honeypot channel.
 * @param settings - The settings of the guild.
 */
export async function catchHoneypotMessage(message: GuildMessage, settings: ReadonlyGuildData): Promise<void> {
	// Without the member the moderator level cannot be checked, so nobody is caught by guess:
	const { member } = message;
	if (member === null || (await isModerator(member))) return;

	floatPromise(resolveOnErrorCodes(container.gatewayClient.messages.delete(message.channelId, message.id, 'Honeypot'), ...IgnoredDeleteCodes));

	if (!(await claimHoneypotCatch(message.guildId, message.author.id))) return;

	const guild = message.guild ?? (await resolveGuild(message.guildId));
	const t = await fetchGuildT(guild);
	const action = settings.honeypotAction;

	let caseId: number | null = null;
	let error: string | undefined;
	// The lock holds the logs of the guild back until the case is made, so the ban is not tracked as a second one:
	const unlock = (await getModeration(guild)).createLock();
	try {
		const sendDirectMessage = settings.honeypotDirectMessage && (await fetchUserReportEnabled(message.author.id));
		const entry = await applyHoneypotAction(guild, action, message.author, t('events/moderation:honeypot'), sendDirectMessage);
		caseId = entry.id;
	} catch (cause) {
		// What Discord refuses (the member is above the bot, a missing permission) is what the moderators can fix:
		if (cause instanceof DiscordAPIError) error = cause.message;
		else container.logger.error(`[Honeypot] Could not act on ${message.author.id} in the guild ${message.guildId}:`, cause);
	} finally {
		unlock();
	}

	container.client.emit(Events.GuildMessageLog, guild, settings.honeypotLogChannel, 'honeypotLogChannel', () =>
		renderHoneypotLog(t, {
			action,
			user: message.author.toJSON(),
			channelId: message.channelId,
			content: message.content,
			attachments: message.attachments.size,
			caseId,
			error
		})
	);
}

/**
 * Takes the action of the honeypot on a user, see {@linkcode HoneypotAction}.
 *
 * @returns The case the action made.
 */
function applyHoneypotAction(guild: Guild, action: HoneypotAction, user: User, reason: string, sendDirectMessage: boolean) {
	switch (action) {
		case 'Kick':
			return ModerationActions.kick.apply(guild, { user, reason }, { sendDirectMessage });
		case 'Softban':
			return ModerationActions.softban.apply(guild, { user, reason }, { sendDirectMessage, context: HoneypotDeleteMessageSeconds });
		case 'Ban':
			return ModerationActions.ban.apply(guild, { user, reason }, { sendDirectMessage, context: HoneypotDeleteMessageSeconds });
	}
}

/**
 * The members this process caught while Redis could not be asked, and when each claim ends, see
 * {@linkcode claimHoneypotCatch}.
 */
const localClaims = new Map<string, number>();

/**
 * Claims a member the honeypot caught, so the messages they send right after are only deleted.
 *
 * @remarks
 *
 * The claim is in Redis, so it holds across the processes of the bot. Without a connection, or when Redis fails, the
 * claim is kept by this process: a burst of messages is still one case here, which is all a single process needs, and
 * the most that can be done when the connection is down.
 *
 * @returns Whether the member was not claimed yet.
 */
async function claimHoneypotCatch(guildId: Snowflake, userId: Snowflake): Promise<boolean> {
	const { redis } = container;
	if (redis?.status === 'ready') {
		try {
			return (await redis.set(`wolfstar:honeypot:caught:${guildId}:${userId}`, '1', 'EX', ClaimSeconds, 'NX')) !== null;
		} catch (error) {
			container.logger.error(`[Honeypot] Could not claim ${userId} in the guild ${guildId} in Redis:`, error);
		}
	}

	return claimHoneypotCatchLocally(`${guildId}:${userId}`);
}

function claimHoneypotCatchLocally(key: string): boolean {
	const now = Date.now();
	// The claims that ended are dropped here, so the map only holds the members of the last minute:
	for (const [claimed, expiresAt] of localClaims) {
		if (expiresAt <= now) localClaims.delete(claimed);
	}

	if (localClaims.has(key)) return false;

	localClaims.set(key, now + seconds(ClaimSeconds));
	return true;
}
