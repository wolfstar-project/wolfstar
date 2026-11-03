import { floatPromise, resolveGuild, resolveOnErrorCodes } from '#common';
import { seconds } from 'wolfstar-shared';
import { fetchUserReportEnabled } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import { fetchGuildT } from '#lib/moderation/common';
import { renderHoneypotLog } from '#lib/moderation/honeypot/log';
import { recordSharedBan } from '#lib/moderation/joinguard/log';
import { scheduleHoneypotSweep } from '#lib/moderation/honeypot/sweep';
import type { GuildMessage } from '#lib/types';
import { Events } from '#lib/types/Enums';
import { claimOnce } from '#utils/claims';
import { describeMessage } from '#utils/debug';
import { getModeration, isModerator } from '#utils/functions';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild, User } from '@wolfstar/plugin-gateway';
import { MessageReferenceType, RESTJSONErrorCodes, Routes, type RESTPostAPIChannelMessageJSONBody, type Snowflake } from 'discord-api-types/v10';
import type { HoneypotAction, ReadonlyGuildData } from 'wolfstar-database';

/**
 * How far back a softban or a ban of the honeypot deletes what the member sent, in every channel. A bot writes in the
 * other channels at the same time, so its messages there go with it.
 */
export const HoneypotDeleteMessageSeconds = seconds.fromHours(1);

/**
 * How far back they delete with `honeypot.recent-delete`, which keeps more of the history of the channels.
 */
export const HoneypotRecentDeleteSeconds = seconds.fromMinutes(15);

/**
 * How long the member is timed out before a softban or a ban with `honeypot.timeout-first`, in milliseconds. Discord
 * keeps a timeout through a leave and a rejoin, so a hacked account that comes back at once still cannot write.
 */
export const HoneypotTimeoutDuration = seconds.fromHours(1) * 1000;

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
 * is above the bot, the bot lacks the permission) is reported as well, and the message is deleted all the same. The
 * options of the honeypot add to it: the message is forwarded to the log channel first (`honeypot.forward-message`),
 * the member is timed out before a softban or a ban (`honeypot.timeout-first`), those delete the last 15 minutes
 * instead of the last hour (`honeypot.recent-delete`), and what the member left is deleted two minutes later
 * (`honeypot.ensure-deletion`).
 *
 * @param message - A message a member sent in the honeypot channel.
 * @param settings - The settings of the guild.
 */
export async function catchHoneypotMessage(message: GuildMessage, settings: ReadonlyGuildData): Promise<void> {
	const subject = describeMessage(message);

	// Without the member the moderator level cannot be checked, so nobody is caught by guess:
	const { member } = message;
	if (member === null) {
		container.logger.debug(`[Honeypot] ${subject}: left alone, the gateway gave no member`);
		return;
	}

	if (await isModerator(member)) {
		container.logger.debug(`[Honeypot] ${subject}: left alone, the author is a moderator`);
		return;
	}

	container.logger.debug(`[Honeypot] ${subject}: caught`);
	// The message is forwarded before it is deleted, since a forward of a deleted message shows nothing:
	if (settings.honeypotForwardMessage && settings.honeypotLogChannel !== null) {
		await forwardCaughtMessage(message, settings.honeypotLogChannel, subject);
	}
	floatPromise(deleteCaughtMessage(message, subject));

	// The claim keeps the messages a bot sends in a row to one case, see {@linkcode claimOnce}:
	if (!(await claimOnce(`honeypot-caught:${message.guildId}:${message.author.id}`, ClaimSeconds))) {
		container.logger.debug(`[Honeypot] ${subject}: no case, the author was caught less than a minute ago`);
		return;
	}

	const guild = message.guild ?? (await resolveGuild(message.guildId));
	const t = await fetchGuildT(guild);
	const action = settings.honeypotAction;

	let caseId: number | null = null;
	let error: string | undefined;
	// The lock holds the logs of the guild back until the case is made, so the ban is not tracked as a second one:
	const unlock = (await getModeration(guild)).createLock();
	try {
		const sendDirectMessage = settings.honeypotDirectMessage && (await fetchUserReportEnabled(message.author.id));
		const reason = t('events/moderation:honeypot');
		// The timeout holds the member while the softban or the ban is taken, and after they come back:
		if (settings.honeypotTimeoutFirst && action !== 'Kick') {
			container.logger.debug(`[Honeypot] ${subject}: timing the member out before the ${action}`);
			await ModerationActions.timeout
				.apply(guild, { user: message.author, reason, duration: HoneypotTimeoutDuration }, { sendDirectMessage: false })
				.catch((cause: unknown) => container.logger.debug(`[Honeypot] ${subject}: the timeout could not be applied:`, cause));
		}

		const deleteSeconds = settings.honeypotRecentDelete ? HoneypotRecentDeleteSeconds : HoneypotDeleteMessageSeconds;
		container.logger.debug(`[Honeypot] ${subject}: taking the action ${action}, direct message ${sendDirectMessage}`);
		const entry = await applyHoneypotAction(guild, action, message.author, reason, sendDirectMessage, deleteSeconds);
		caseId = entry.id;
		container.logger.debug(`[Honeypot] ${subject}: the action made the case ${caseId}`);
		// Who writes in the trap is a spam bot or a hacked account, which the checkpoint of every guild then refuses:
		if (action !== 'Kick') await recordSharedBan({ guildId: guild.id, userId: message.author.id, caseId, source: 'Honeypot' });
	} catch (cause) {
		// What Discord refuses (the member is above the bot, a missing permission) is what the moderators can fix:
		if (cause instanceof DiscordAPIError) {
			error = cause.message;
			container.logger.debug(`[Honeypot] ${subject}: Discord refused the action ${action}: ${error}`);
		} else container.logger.error(`[Honeypot] Could not act on ${message.author.id} in the guild ${message.guildId}:`, cause);
	} finally {
		unlock();
	}

	// What the member left is looked for in two minutes, whether the action was taken or not:
	if (settings.honeypotEnsureDeletion) await scheduleHoneypotSweep({ guildId: message.guildId, userId: message.author.id });

	container.logger.debug(`[Honeypot] ${subject}: reporting it to the channel ${settings.honeypotLogChannel}`);
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
 * Deletes a message that was caught. What cannot be deleted stays in the channel, and only the debug log says so.
 */
async function deleteCaughtMessage(message: GuildMessage, subject: string): Promise<void> {
	const deleted = await resolveOnErrorCodes(
		container.gatewayClient.messages.delete(message.channelId, message.id, 'Honeypot'),
		...IgnoredDeleteCodes
	);
	container.logger.debug(`[Honeypot] ${subject}: ${deleted === null ? 'the message could not be deleted' : 'the message was deleted'}`);
}

/**
 * Takes the action of the honeypot on a user, see {@linkcode HoneypotAction}.
 *
 * @returns The case the action made.
 */
function applyHoneypotAction(guild: Guild, action: HoneypotAction, user: User, reason: string, sendDirectMessage: boolean, deleteSeconds: number) {
	switch (action) {
		case 'Kick':
			return ModerationActions.kick.apply(guild, { user, reason }, { sendDirectMessage });
		case 'Softban':
			return ModerationActions.softban.apply(guild, { user, reason }, { sendDirectMessage, context: deleteSeconds });
		case 'Ban':
			return ModerationActions.ban.apply(guild, { user, reason }, { sendDirectMessage, context: deleteSeconds });
	}
}

/**
 * Forwards a message that was caught to the log channel of the honeypot, before it is deleted, so the moderators see
 * it as it was, attachments included (`honeypot.forward-message`). A forward that fails is only logged: the quote of
 * the log still says what was sent.
 */
async function forwardCaughtMessage(message: GuildMessage, logChannelId: Snowflake, subject: string): Promise<void> {
	const body: RESTPostAPIChannelMessageJSONBody = {
		message_reference: {
			type: MessageReferenceType.Forward,
			guild_id: message.guildId,
			channel_id: message.channelId,
			message_id: message.id,
			fail_if_not_exists: false
		},
		allowed_mentions: { parse: [] }
	};
	try {
		await container.rest.post(Routes.channelMessages(logChannelId), { body });
		container.logger.debug(`[Honeypot] ${subject}: the message was forwarded to ${logChannelId}`);
	} catch (error) {
		container.logger.debug(`[Honeypot] ${subject}: the message could not be forwarded to ${logChannelId}:`, error);
	}
}
