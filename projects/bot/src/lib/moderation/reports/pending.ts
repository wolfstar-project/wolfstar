import { minutes } from '#common';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * What a member reports, as it was when they opened the report: the message may be edited or deleted before the
 * moderators see it.
 */
export interface ReportSubject {
	targetId: Snowflake;
	targetTag: string;

	/**
	 * The reported message, `null` when the member reported a user and not one of their messages.
	 */
	message: { channelId: Snowflake; id: Snowflake; content: string; attachments: string[] } | null;
}

const Prefix = 'wolfstar:reports';

/**
 * How long a member has to write the reason of a report, the time its subject is kept for.
 */
const PendingSeconds = minutes.toSeconds(15);

/**
 * How long a member waits between two reports.
 */
export const ReportCooldownSeconds = 60;

/**
 * How long a message that was reported cannot be reported again.
 */
const DuplicateSeconds = minutes.toSeconds(60 * 24);

/**
 * Keeps the subject of a report while the member writes its reason in the modal, which only carries IDs back.
 */
export async function savePendingReport(guildId: Snowflake, reporterId: Snowflake, subject: ReportSubject) {
	await container.redis.set(`${Prefix}:pending:${guildId}:${reporterId}`, JSON.stringify(subject), 'EX', PendingSeconds);
}

/**
 * Takes the subject {@linkcode savePendingReport} kept, which can only be taken once.
 *
 * @returns The subject, or `null` when it expired or is not the one the modal was opened for.
 */
export async function takePendingReport(
	guildId: Snowflake,
	reporterId: Snowflake,
	targetId: Snowflake,
	messageId: Snowflake | null
): Promise<ReportSubject | null> {
	const raw = await container.redis.getdel(`${Prefix}:pending:${guildId}:${reporterId}`);
	if (raw === null) return null;

	const subject = JSON.parse(raw) as ReportSubject;
	return subject.targetId === targetId && (subject.message?.id ?? null) === messageId ? subject : null;
}

export type ReportClaim = 'ok' | 'cooldown' | 'duplicate';

/**
 * Claims the right to send a report: a member sends one every {@linkcode ReportCooldownSeconds}, and a message is
 * reported once a day, so the moderators are not sent the same report by every member who saw it.
 *
 * @remarks The claims are in Redis, so they hold across the shards. Give them back with {@linkcode releaseReport} when
 * the report could not be sent.
 */
export async function claimReport(guildId: Snowflake, reporterId: Snowflake, messageId: Snowflake | null): Promise<ReportClaim> {
	const { redis } = container;
	if (messageId !== null) {
		const claimed = await redis.set(`${Prefix}:message:${guildId}:${messageId}`, reporterId, 'EX', DuplicateSeconds, 'NX');
		if (claimed === null) return 'duplicate';
	}

	const cooldown = await redis.set(`${Prefix}:cooldown:${guildId}:${reporterId}`, '1', 'EX', ReportCooldownSeconds, 'NX');
	if (cooldown === null) {
		if (messageId !== null) await redis.del(`${Prefix}:message:${guildId}:${messageId}`);
		return 'cooldown';
	}

	return 'ok';
}

export async function releaseReport(guildId: Snowflake, reporterId: Snowflake, messageId: Snowflake | null) {
	const keys = [`${Prefix}:cooldown:${guildId}:${reporterId}`];
	if (messageId !== null) keys.push(`${Prefix}:message:${guildId}:${messageId}`);
	await container.redis.del(...keys);
}
