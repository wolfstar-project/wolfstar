import type { Database } from '../../index.js';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most message histories a guild keeps: the oldest one goes when a new one would be more.
 */
export const MaximumMessageHistories = 100;

/**
 * How long a message history is kept, two years.
 */
export const MessageHistoryLifetime = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * A message of a history, as it was when the history was made. The attachments are their links, not copies.
 */
export interface MessageHistoryMessage {
	id: Snowflake;
	channelId: Snowflake;
	content: string;
	/** When it was sent, in milliseconds. */
	createdAt: number;
	attachments: string[];
}

/**
 * The messages a member sent, saved by a moderator, optionally for a case.
 */
export interface MessageHistory {
	id: string;
	guildId: Snowflake;
	userId: Snowflake;
	moderatorId: Snowflake;
	caseId: number | null;
	/** In milliseconds. */
	createdAt: number;
	/** In milliseconds. */
	expiresAt: number;
	messages: MessageHistoryMessage[];
}

export type MessageHistoryData = Pick<MessageHistory, 'userId' | 'moderatorId' | 'caseId' | 'messages'>;

type Row = {
	id: bigint;
	guildId: bigint;
	userId: bigint;
	moderatorId: bigint;
	caseId: number | null;
	createdAt: string;
	expiresAt: string;
	messages: unknown;
};

function isMessage(value: unknown): value is MessageHistoryMessage {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.id === 'string' &&
		typeof entry.channelId === 'string' &&
		typeof entry.content === 'string' &&
		typeof entry.createdAt === 'number' &&
		Array.isArray(entry.attachments)
	);
}

function toMessageHistory(row: Row): MessageHistory {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		userId: String(row.userId),
		moderatorId: String(row.moderatorId),
		caseId: row.caseId,
		createdAt: parseTimestamp(row.createdAt),
		expiresAt: parseTimestamp(row.expiresAt),
		// The column is JSON, which is read as the bot wrote it but not trusted:
		messages: Array.isArray(row.messages) ? row.messages.filter((message) => isMessage(message)) : []
	};
}

/**
 * Reads the message histories of a guild that did not expire, newest first, optionally of one user.
 * @param db The database to read through.
 * @param guildId The guild's ID.
 * @param userId The user's ID, every user when it is left out.
 * @param now The time the expired ones are left out by.
 */
export async function fetchMessageHistories(db: Database, guildId: Snowflake, userId?: Snowflake, now = Date.now()): Promise<MessageHistory[]> {
	const where = userId === undefined ? { guildId: BigInt(guildId) } : { guildId: BigInt(guildId), userId: BigInt(userId) };
	const rows = (await db.orm.public.MessageHistory.where(where).all()) as unknown as Row[];
	return rows
		.map((row) => toMessageHistory(row))
		.filter((history) => history.expiresAt > now)
		.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Reads a message history of a guild, by its ID.
 * @returns The history, `null` when the guild has none with that ID or it expired.
 */
export async function fetchMessageHistory(db: Database, guildId: Snowflake, id: string, now = Date.now()): Promise<MessageHistory | null> {
	if (!/^\d{1,19}$/.test(id)) return null;

	const row = (await db.orm.public.MessageHistory.first({ id: BigInt(id), guildId: BigInt(guildId) })) as unknown as Row | null;
	if (row === null) return null;

	const history = toMessageHistory(row);
	return history.expiresAt > now ? history : null;
}

/**
 * Saves a message history, and deletes the oldest ones of the guild past {@linkcode MaximumMessageHistories} and the
 * ones that expired. It creates the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The history.
 * @param now The time it is made at.
 * @param language The language a `Guild` row is created with.
 */
export async function createMessageHistory(
	db: Database,
	guildId: Snowflake,
	data: MessageHistoryData,
	now = Date.now(),
	language = 'en-US'
): Promise<MessageHistory> {
	const id = BigInt(guildId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const histories = tx.orm.public.MessageHistory;
		const created = (await histories.create({
			guildId: id,
			userId: BigInt(data.userId),
			moderatorId: BigInt(data.moderatorId),
			caseId: data.caseId,
			createdAt: formatTimestamp(now) as never,
			expiresAt: formatTimestamp(now + MessageHistoryLifetime) as never,
			messages: data.messages as never
		})) as unknown as Row;

		// The oldest ones go, and so do the ones that expired:
		const rows = (await histories.where({ guildId: id }).all()) as unknown as Row[];
		const stale = rows
			.map((row) => toMessageHistory(row))
			.sort((a, b) => b.createdAt - a.createdAt || (BigInt(b.id) > BigInt(a.id) ? 1 : -1))
			.filter((history, index) => index >= MaximumMessageHistories || history.expiresAt <= now);
		for (const history of stale) await histories.where({ id: BigInt(history.id) }).deleteAndCount();

		return toMessageHistory(created);
	});
}

/**
 * Links a message history to the case it was made for.
 */
export async function setMessageHistoryCase(db: Database, guildId: Snowflake, id: string, caseId: number): Promise<void> {
	await db.orm.public.MessageHistory.where({ id: BigInt(id), guildId: BigInt(guildId) }).updateAndCount({ caseId });
}
