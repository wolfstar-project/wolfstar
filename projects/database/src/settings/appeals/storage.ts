import type { Database } from '../../index.js';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type { AppealAnswer } from './types.js';
import { and } from '@prisma/orm-postgres/orm-client';
import type { Snowflake } from 'discord-api-types/v10';

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
	/** The form it was sent with, `null` for the built-in one or a form that was deleted. */
	formId: string | null;
	answers: AppealAnswer[];
	status: AppealStatus;
	reviewerId: Snowflake | null;
	reason: string | null;
	/** The channel its message was sent to, `null` when it could not be sent. */
	channelId: Snowflake | null;
	/** Its message in that channel, `null` when it could not be sent. */
	messageId: Snowflake | null;
	/** Its thread, `null` when it has none. */
	threadId: Snowflake | null;
	/** When it was decided, in milliseconds. */
	decidedAt: number | null;
	/** In milliseconds. */
	createdAt: number;
}

type Row = {
	id: bigint;
	guildId: bigint;
	caseId: number;
	userId: bigint;
	formId: bigint | null;
	answers: AppealAnswer[];
	status: string;
	reviewerId: bigint | null;
	reason: string | null;
	channelId: bigint | null;
	messageId: bigint | null;
	threadId: bigint | null;
	decidedAt: string | null;
	createdAt: string;
};

function toAppeal(row: Row): Appeal {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		caseId: row.caseId,
		userId: String(row.userId),
		formId: row.formId === null ? null : String(row.formId),
		answers: row.answers,
		status: (AppealStatuses as readonly string[]).includes(row.status) ? (row.status as AppealStatus) : 'pending',
		reviewerId: row.reviewerId === null ? null : String(row.reviewerId),
		reason: row.reason,
		channelId: row.channelId === null ? null : String(row.channelId),
		messageId: row.messageId === null ? null : String(row.messageId),
		threadId: row.threadId === null ? null : String(row.threadId),
		decidedAt: row.decidedAt === null ? null : parseTimestamp(row.decidedAt),
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
 * What {@linkcode fetchAppeals} and {@linkcode countAppeals} read: every appeal of a guild, or the ones in a status or
 * sent with a form.
 */
export interface AppealFilter {
	status?: AppealStatus | undefined;
	formId?: string | undefined;
}

function whereAppeals(guildId: Snowflake, { status, formId }: AppealFilter) {
	return {
		guildId: BigInt(guildId),
		...(status === undefined ? {} : { status }),
		...(formId === undefined ? {} : { formId: BigInt(formId) })
	};
}

/**
 * Reads the appeals of a guild, the latest ones first.
 */
export async function fetchAppeals(db: Database, guildId: Snowflake, options: AppealFilter & { limit: number; offset?: number }): Promise<Appeal[]> {
	const rows = (await db.orm.public.Appeal.where(whereAppeals(guildId, options))
		.orderBy((appeal) => appeal.id.desc())
		.limit(options.limit)
		.offset(options.offset ?? 0)
		.all()) as unknown as Row[];
	return rows.map((row) => toAppeal(row));
}

/**
 * Counts the appeals of a guild.
 */
export async function countAppeals(db: Database, guildId: Snowflake, filter: AppealFilter = {}): Promise<number> {
	const { total } = await db.orm.public.Appeal.where(whereAppeals(guildId, filter)).aggregate((aggregate) => ({ total: aggregate.count() }));
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
 * Reads the appeal of a thread.
 * @returns The appeal, `null` when it is the thread of none.
 */
export async function fetchAppealByThread(db: Database, guildId: Snowflake, threadId: Snowflake): Promise<Appeal | null> {
	const row = (await db.orm.public.Appeal.first({ guildId: BigInt(guildId), threadId: BigInt(threadId) })) as unknown as Row | null;
	return row === null ? null : toAppeal(row);
}

/**
 * Reads the appeals of a user that wait for a decision and have a thread, in every guild: what `/reply` can answer.
 */
export async function fetchPendingAppealsWithThread(db: Database, userId: Snowflake): Promise<Appeal[]> {
	const rows = (await db.orm.public.Appeal.where((appeal) =>
		and(appeal.userId.eq(BigInt(userId)), appeal.status.eq('pending'), appeal.threadId.isNotNull())
	).all()) as unknown as Row[];
	return rows.map((row) => toAppeal(row));
}

/**
 * Reads the latest appeal of a user that a guild denied, which the cooldown counts from.
 */
export async function fetchLatestDeniedAppeal(db: Database, guildId: Snowflake, userId: Snowflake): Promise<Appeal | null> {
	const row = (await db.orm.public.Appeal.where({ guildId: BigInt(guildId), userId: BigInt(userId), status: 'denied' })
		.orderBy((appeal) => appeal.id.desc())
		.first()) as unknown as Row | null;
	return row === null ? null : toAppeal(row);
}

/**
 * Counts the appeals of a user that wait for a decision in a guild.
 */
export async function countPendingAppeals(db: Database, guildId: Snowflake, userId: Snowflake): Promise<number> {
	const { total } = await db.orm.public.Appeal.where({ guildId: BigInt(guildId), userId: BigInt(userId), status: 'pending' }).aggregate(
		(aggregate) => ({ total: aggregate.count() })
	);
	return total;
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
 * Remembers the thread of an appeal, once it was started.
 */
export async function setAppealThread(db: Database, guildId: Snowflake, id: string, threadId: Snowflake): Promise<void> {
	await db.orm.public.Appeal.where({ id: BigInt(id), guildId: BigInt(guildId) }).updateAndCount({ threadId: BigInt(threadId) });
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
	data: Pick<Appeal, 'caseId' | 'userId' | 'formId' | 'answers'>,
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
			formId: data.formId === null ? null : BigInt(data.formId),
			answers: data.answers,
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
		reason,
		decidedAt: formatTimestamp(Date.now()) as never
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
		reason: null,
		decidedAt: null
	});
}
