import type { Database } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Reads the sticky nickname of a member.
 * @param db The database to read through.
 * @param guildId The guild's ID.
 * @param userId The user's ID.
 * @returns The nickname, or `null` when the member has none.
 */
export async function fetchStickyNickname(db: Database, guildId: Snowflake, userId: Snowflake): Promise<string | null> {
	const row = await db.orm.public.StickyNickname.first({ guildId: BigInt(guildId), userId: BigInt(userId) });
	return row?.nickname ?? null;
}

/**
 * Makes the nickname of a member sticky, and creates the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param userId The user's ID.
 * @param nickname The nickname, which replaces the one the member has.
 * @param language The language a `Guild` row is created with.
 */
export async function setStickyNickname(db: Database, guildId: Snowflake, userId: Snowflake, nickname: string, language = 'en-US'): Promise<void> {
	const id = BigInt(guildId);
	const where = { guildId: id, userId: BigInt(userId) };

	await db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const nicknames = tx.orm.public.StickyNickname;
		const count = await nicknames.where(where).updateAndCount({ nickname });
		if (Number(count) === 0) await nicknames.create({ ...where, nickname });
	});
}

/**
 * Removes the sticky nickname of a member.
 * @returns Whether the member had one.
 */
export async function deleteStickyNickname(db: Database, guildId: Snowflake, userId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.StickyNickname.where({ guildId: BigInt(guildId), userId: BigInt(userId) }).deleteAndCount();
	return Number(count) > 0;
}
