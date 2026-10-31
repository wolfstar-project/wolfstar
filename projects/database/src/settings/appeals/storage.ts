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
