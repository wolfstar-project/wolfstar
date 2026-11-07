import type { Database, Models } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type { AutoMessage, AutoMessageData } from './types.js';

type Orm = Database['orm'];
type Row = Omit<Models.public_GuildAutoMessage, 'guild'>;

/** The intervals are stored in seconds, so the longest ones fit in the 32-bit column. */
const toSeconds = (milliseconds: number) => Math.round(milliseconds / 1000);
const toTimestamp = (milliseconds: number) => formatTimestamp(milliseconds) as Row['nextRunAt'];

function toAutoMessage(row: Row): AutoMessage {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		channelId: String(row.channelId),
		content: row.content,
		interval: row.interval * 1000,
		mentions: row.mentions,
		lastMessageId: row.lastMessageId === null ? null : String(row.lastMessageId),
		nextRunAt: parseTimestamp(row.nextRunAt)
	};
}

/**
 * Reads the automatic messages of a guild, oldest first.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 * @param guildId The guild's ID.
 */
export async function fetchAutoMessages(orm: Orm, guildId: Snowflake): Promise<AutoMessage[]> {
	const rows = await orm.public.GuildAutoMessage.where({ guildId: BigInt(guildId) }).all();
	return rows.map((row) => toAutoMessage(row)).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * Reads the automatic message of a channel.
 * @param orm The ORM surface to read through.
 * @param guildId The guild's ID.
 * @param channelId The channel's ID.
 */
export async function fetchAutoMessage(orm: Orm, guildId: Snowflake, channelId: Snowflake): Promise<AutoMessage | null> {
	const row = await orm.public.GuildAutoMessage.first({ channelId: BigInt(channelId), guildId: BigInt(guildId) });
	return row === null ? null : toAutoMessage(row);
}

/**
 * Reads the automatic messages that are due, of every guild, the ones that wait the longest first.
 * @param orm The ORM surface to read through.
 * @param now The time they are due by, in milliseconds.
 * @param limit How many to read at most.
 */
export async function fetchDueAutoMessages(orm: Orm, now: number, limit: number): Promise<AutoMessage[]> {
	const rows = await orm.public.GuildAutoMessage.where((message) => message.nextRunAt.lte(toTimestamp(now)))
		.orderBy((message) => message.nextRunAt.asc())
		.limit(limit)
		.all();
	return rows.map((row) => toAutoMessage(row));
}

/**
 * Sets the automatic message of a channel, and creates the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The message, which replaces the one the channel has.
 * @param nextRunAt When it is sent first, in milliseconds.
 * @param language The language a `Guild` row is created with.
 */
export async function setAutoMessage(
	db: Database,
	guildId: Snowflake,
	data: AutoMessageData,
	nextRunAt: number,
	language = 'en-US'
): Promise<AutoMessage> {
	const id = BigInt(guildId);
	const channelId = BigInt(data.channelId);
	const columns = { content: data.content, interval: toSeconds(data.interval), mentions: data.mentions, nextRunAt: toTimestamp(nextRunAt) };

	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const messages = tx.orm.public.GuildAutoMessage;
		const count = await messages.where({ channelId, guildId: id }).updateAndCount(columns);
		if (Number(count) === 0) await messages.create({ guildId: id, channelId, ...columns });

		return toAutoMessage((await messages.first({ channelId, guildId: id }))!);
	});
}

/**
 * Sets when an automatic message is sent next.
 */
export async function setAutoMessageNextRun(db: Database, messageId: string, nextRunAt: number): Promise<void> {
	await db.orm.public.GuildAutoMessage.where({ id: BigInt(messageId) }).updateAndCount({ nextRunAt: toTimestamp(nextRunAt) });
}

/**
 * Remembers the message the bot sent last for an automatic message.
 */
export async function setAutoMessageLastMessage(db: Database, messageId: string, lastMessageId: Snowflake): Promise<void> {
	await db.orm.public.GuildAutoMessage.where({ id: BigInt(messageId) }).updateAndCount({ lastMessageId: BigInt(lastMessageId) });
}

/**
 * Stops sending the automatic message of a channel.
 * @returns Whether the channel had one.
 */
export async function deleteAutoMessage(db: Database, guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.GuildAutoMessage.where({ channelId: BigInt(channelId), guildId: BigInt(guildId) }).deleteAndCount();
	return Number(count) > 0;
}
