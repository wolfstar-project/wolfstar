import type { Database, Models } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import { formatTimestamp, parseTimestamp } from '../time.js';
import { isAutoDeleteAllowKind, isCleanupFilterKind, type AutoDelete, type AutoDeleteData, type AutoPurge, type AutoPurgeData } from './types.js';

type Orm = Database['orm'];
type PurgeRow = Omit<Models.public_GuildAutoPurge, 'guild'>;
type DeleteRow = Omit<Models.public_GuildAutoDelete, 'guild'>;

/** The intervals and the delays are stored in seconds, so the longest ones fit in the 32-bit columns. */
const toSeconds = (milliseconds: number) => Math.round(milliseconds / 1000);
const toTimestamp = (milliseconds: number) => formatTimestamp(milliseconds) as PurgeRow['nextRunAt'];

function toAutoPurge(row: PurgeRow): AutoPurge {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		channelId: String(row.channelId),
		interval: row.interval * 1000,
		// A filter this version does not know deletes nothing, rather than everything:
		filter: isCleanupFilterKind(row.filter) ? row.filter : 'user',
		value: isCleanupFilterKind(row.filter) ? row.value : '',
		nextRunAt: parseTimestamp(row.nextRunAt)
	};
}

function toAutoDelete(row: DeleteRow): AutoDelete {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		channelId: String(row.channelId),
		delay: row.delay * 1000,
		allow: row.allow.filter((kind) => isAutoDeleteAllowKind(kind)),
		bots: row.bots
	};
}

/**
 * Reads the channels of a guild that are purged, oldest first.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 * @param guildId The guild's ID.
 */
export async function fetchAutoPurges(orm: Orm, guildId: Snowflake): Promise<AutoPurge[]> {
	const rows = await orm.public.GuildAutoPurge.where({ guildId: BigInt(guildId) }).all();
	return rows.map((row) => toAutoPurge(row)).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * Reads the purges that are due, of every guild, the ones that wait the longest first.
 * @param orm The ORM surface to read through.
 * @param now The time they are due by, in milliseconds.
 * @param limit How many to read at most.
 */
export async function fetchDueAutoPurges(orm: Orm, now: number, limit: number): Promise<AutoPurge[]> {
	const rows = await orm.public.GuildAutoPurge.where((purge) => purge.nextRunAt.lte(toTimestamp(now)))
		.orderBy((purge) => purge.nextRunAt.asc())
		.limit(limit)
		.all();
	return rows.map((row) => toAutoPurge(row));
}

/**
 * Sets the purge of a channel, and creates the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The purge, which replaces the one the channel has.
 * @param nextRunAt When it runs first, in milliseconds.
 * @param language The language a `Guild` row is created with.
 */
export async function setAutoPurge(db: Database, guildId: Snowflake, data: AutoPurgeData, nextRunAt: number, language = 'en-US'): Promise<AutoPurge> {
	const id = BigInt(guildId);
	const channelId = BigInt(data.channelId);
	const columns = { interval: toSeconds(data.interval), filter: data.filter, value: data.value, nextRunAt: toTimestamp(nextRunAt) };

	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const purges = tx.orm.public.GuildAutoPurge;
		const count = await purges.where({ channelId, guildId: id }).updateAndCount(columns);
		if (Number(count) === 0) await purges.create({ guildId: id, channelId, ...columns });

		return toAutoPurge((await purges.first({ channelId, guildId: id }))!);
	});
}

/**
 * Sets when a purge runs next.
 */
export async function setAutoPurgeNextRun(db: Database, purgeId: string, nextRunAt: number): Promise<void> {
	await db.orm.public.GuildAutoPurge.where({ id: BigInt(purgeId) }).updateAndCount({ nextRunAt: toTimestamp(nextRunAt) });
}

/**
 * Stops purging a channel.
 * @returns Whether the channel was purged.
 */
export async function deleteAutoPurge(db: Database, guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.GuildAutoPurge.where({ channelId: BigInt(channelId), guildId: BigInt(guildId) }).deleteAndCount();
	return Number(count) > 0;
}

/**
 * Reads the channels of a guild whose messages are deleted, oldest first.
 * @param orm The ORM surface to read through.
 * @param guildId The guild's ID.
 */
export async function fetchAutoDeletes(orm: Orm, guildId: Snowflake): Promise<AutoDelete[]> {
	const rows = await orm.public.GuildAutoDelete.where({ guildId: BigInt(guildId) }).all();
	return rows.map((row) => toAutoDelete(row)).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * Sets the automatic deletion of a channel, and creates the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The deletion, which replaces the one the channel has.
 * @param language The language a `Guild` row is created with.
 */
export async function setAutoDelete(db: Database, guildId: Snowflake, data: AutoDeleteData, language = 'en-US'): Promise<AutoDelete> {
	const id = BigInt(guildId);
	const channelId = BigInt(data.channelId);
	const columns = { delay: toSeconds(data.delay), allow: [...data.allow], bots: data.bots };

	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const deletes = tx.orm.public.GuildAutoDelete;
		const count = await deletes.where({ channelId, guildId: id }).updateAndCount(columns);
		if (Number(count) === 0) await deletes.create({ guildId: id, channelId, ...columns });

		return toAutoDelete((await deletes.first({ channelId, guildId: id }))!);
	});
}

/**
 * Stops deleting the messages of a channel.
 * @returns Whether the channel had its messages deleted.
 */
export async function deleteAutoDelete(db: Database, guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.GuildAutoDelete.where({ channelId: BigInt(channelId), guildId: BigInt(guildId) }).deleteAndCount();
	return Number(count) > 0;
}
