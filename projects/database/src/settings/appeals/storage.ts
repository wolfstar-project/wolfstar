import type { Database } from '../../index.js';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most questions the form of an appeal asks.
 */
export const MaximumAppealQuestions = 5;

/**
 * The longest answer to a question of an appeal.
 */
export const MaximumAppealAnswerLength = 1000;

/**
 * Where an appeal stands: waiting for a moderator, accepted (its case was undone) or denied.
 */
export const AppealStatuses = ['pending', 'accepted', 'denied'] as const;
export type AppealStatus = (typeof AppealStatuses)[number];

/**
 * What a member wrote to ask for a case to be undone, and what the moderators decided. A case is appealed once.
 */
export interface Appeal {
	id: string;
	guildId: Snowflake;
	caseId: number;
	userId: Snowflake;
	answers: string[];
	status: AppealStatus;
	reviewerId: Snowflake | null;
	reason: string | null;
	/** The channel its message was sent to, `null` when it could not be sent. */
	channelId: Snowflake | null;
	/** Its message in that channel, `null` when it could not be sent. The thread of the appeal has the same ID. */
	messageId: Snowflake | null;
	/** In milliseconds. */
	createdAt: number;
}

type Row = {
	id: bigint;
	guildId: bigint;
	caseId: number;
	userId: bigint;
	answers: string[];
	status: string;
	reviewerId: bigint | null;
	reason: string | null;
	channelId: bigint | null;
	messageId: bigint | null;
	createdAt: string;
};

function toAppeal(row: Row): Appeal {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		caseId: row.caseId,
		userId: String(row.userId),
		answers: [...row.answers],
		status: (AppealStatuses as readonly string[]).includes(row.status) ? (row.status as AppealStatus) : 'pending',
		reviewerId: row.reviewerId === null ? null : String(row.reviewerId),
		reason: row.reason,
		channelId: row.channelId === null ? null : String(row.channelId),
		messageId: row.messageId === null ? null : String(row.messageId),
		createdAt: parseTimestamp(row.createdAt)
	};
}

/**
 * Reads the appeals of a user in a guild.
 */
export async function fetchUserAppeals(db: Database, guildId: Snowflake, userId: Snowflake): Promise<Appeal[]> {
	const rows = (await db.orm.public.Appeal.where({ guildId: BigInt(guildId), userId: BigInt(userId) }).all()) as unknown as Row[];
	return rows.map((row) => toAppeal(row));
}

/**
 * What {@linkcode fetchAppeals} and {@linkcode countAppeals} read: every appeal of a guild, or the ones in a status.
 */
function whereAppeals(guildId: Snowflake, status: AppealStatus | undefined) {
	return status === undefined ? { guildId: BigInt(guildId) } : { guildId: BigInt(guildId), status };
}

/**
 * Reads the appeals of a guild, the latest ones first.
 */
export async function fetchAppeals(
	db: Database,
	guildId: Snowflake,
	options: { status?: AppealStatus; limit: number; offset?: number }
): Promise<Appeal[]> {
	const rows = (await db.orm.public.Appeal.where(whereAppeals(guildId, options.status))
		.orderBy((appeal) => appeal.id.desc())
		.limit(options.limit)
		.offset(options.offset ?? 0)
		.all()) as unknown as Row[];
	return rows.map((row) => toAppeal(row));
}

/**
 * Counts the appeals of a guild.
 */
export async function countAppeals(db: Database, guildId: Snowflake, status?: AppealStatus): Promise<number> {
	const { total } = await db.orm.public.Appeal.where(whereAppeals(guildId, status)).aggregate((aggregate) => ({ total: aggregate.count() }));
	return total;
}

/**
 * Reads the appeal of a case, a case being appealed once.
 * @returns The appeal, `null` when the case has none.
 */
export async function fetchAppealByCase(db: Database, guildId: Snowflake, caseId: number): Promise<Appeal | null> {
	const row = (await db.orm.public.Appeal.first({ guildId: BigInt(guildId), caseId })) as unknown as Row | null;
	return row === null ? null : toAppeal(row);
}

/**
 * Reads the appeal of a message, or of a thread, which has the ID of the message it was started from.
 * @returns The appeal, `null` when it is the message of none.
 */
export async function fetchAppealByMessage(db: Database, guildId: Snowflake, messageId: Snowflake): Promise<Appeal | null> {
	const row = (await db.orm.public.Appeal.first({ guildId: BigInt(guildId), messageId: BigInt(messageId) })) as unknown as Row | null;
	return row === null ? null : toAppeal(row);
}

/**
 * Remembers the message of an appeal, once it was sent.
 */
export async function setAppealMessage(db: Database, guildId: Snowflake, id: string, channelId: Snowflake, messageId: Snowflake): Promise<void> {
	await db.orm.public.Appeal.where({ id: BigInt(id), guildId: BigInt(guildId) }).updateAndCount({
		channelId: BigInt(channelId),
		messageId: BigInt(messageId)
	});
}

/**
 * Reads an appeal by its ID.
 * @returns The appeal, `null` when the guild has none with that ID.
 */
export async function fetchAppeal(db: Database, guildId: Snowflake, id: string): Promise<Appeal | null> {
	if (!/^\d{1,19}$/.test(id)) return null;
	const row = (await db.orm.public.Appeal.first({ id: BigInt(id), guildId: BigInt(guildId) })) as unknown as Row | null;
	return row === null ? null : toAppeal(row);
}

/**
 * Creates the appeal of a case, and the `Guild` row it references when the guild has none yet.
 * @returns The appeal, `null` when the case was appealed already.
 */
export async function createAppeal(
	db: Database,
	guildId: Snowflake,
	data: Pick<Appeal, 'caseId' | 'userId' | 'answers'>,
	now = Date.now(),
	language = 'en-US'
): Promise<Appeal | null> {
	const id = BigInt(guildId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const appeals = tx.orm.public.Appeal;
		if ((await appeals.first({ guildId: id, caseId: data.caseId })) !== null) return null;

		const row = (await appeals.create({
			guildId: id,
			caseId: data.caseId,
			userId: BigInt(data.userId),
			answers: [...data.answers],
			status: 'pending',
			createdAt: formatTimestamp(now) as never
		})) as unknown as Row;
		return toAppeal(row);
	});
}

/**
 * Decides a pending appeal, once: two moderators clicking at the same time do not both decide it.
 * @returns Whether it was pending and is now decided.
 */
export async function decideAppeal(
	db: Database,
	guildId: Snowflake,
	id: string,
	status: Exclude<AppealStatus, 'pending'>,
	reviewerId: Snowflake,
	reason: string | null
): Promise<boolean> {
	const count = await db.orm.public.Appeal.where({ id: BigInt(id), guildId: BigInt(guildId), status: 'pending' }).updateAndCount({
		status,
		reviewerId: BigInt(reviewerId),
		reason
	});
	return Number(count) > 0;
}

/**
 * Puts a decided appeal back to pending, when what the decision had to do failed.
 */
export async function reopenAppeal(db: Database, guildId: Snowflake, id: string): Promise<void> {
	await db.orm.public.Appeal.where({ id: BigInt(id), guildId: BigInt(guildId) }).updateAndCount({
		status: 'pending',
		reviewerId: null,
		reason: null
	});
}
