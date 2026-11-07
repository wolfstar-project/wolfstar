import type { Database } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most predefined reasons a guild has.
 */
export const MaximumModerationReasons = 25;

/**
 * The longest alias of a predefined reason, short enough to type in the `reason` option of a command.
 */
export const MaximumModerationReasonAliasLength = 20;

/**
 * The longest predefined reason, the one the `reason` option of the moderation commands takes.
 */
export const MaximumModerationReasonLength = 500;

/**
 * A reason a guild defined for its moderation cases, written in the `reason` option of a command by its alias.
 */
export interface ModerationReason {
	alias: string;
	reason: string;
}

/**
 * Reads the predefined reasons of a guild, by alias.
 * @param db The database to read through.
 * @param guildId The guild's ID.
 */
export async function fetchModerationReasons(db: Database, guildId: Snowflake): Promise<ModerationReason[]> {
	const rows = await db.orm.public.GuildModerationReason.where({ guildId: BigInt(guildId) }).all();
	return rows.map((row) => ({ alias: row.alias, reason: row.reason })).sort((a, b) => a.alias.localeCompare(b.alias));
}

/**
 * Sets a predefined reason, replacing the one with the same alias, and creates the `Guild` row it references when the
 * guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The reason, its alias in lowercase.
 * @param language The language a `Guild` row is created with.
 * @returns Whether it was new, `false` when it replaced one.
 */
export async function setModerationReason(db: Database, guildId: Snowflake, data: ModerationReason, language = 'en-US'): Promise<boolean> {
	const id = BigInt(guildId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const reasons = tx.orm.public.GuildModerationReason;
		const count = await reasons.where({ guildId: id, alias: data.alias }).updateAndCount({ reason: data.reason });
		if (Number(count) > 0) return false;

		await reasons.create({ guildId: id, alias: data.alias, reason: data.reason });
		return true;
	});
}

/**
 * Removes a predefined reason.
 * @returns Whether the guild had it.
 */
export async function deleteModerationReason(db: Database, guildId: Snowflake, alias: string): Promise<boolean> {
	const count = await db.orm.public.GuildModerationReason.where({ guildId: BigInt(guildId), alias }).deleteAndCount();
	return Number(count) > 0;
}
