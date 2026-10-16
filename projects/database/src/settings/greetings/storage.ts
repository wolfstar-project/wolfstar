import type { Database } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most role messages a guild has.
 */
export const MaximumRoleMessages = 10;

/**
 * The messages sent when a member gets, or loses, a role.
 */
export interface RoleMessage {
	roleId: Snowflake;
	channelId: Snowflake;
	/** Sent when the member gets the role, `null` sends nothing. */
	added: string | null;
	/** Sent when the member loses the role, `null` sends nothing. */
	removed: string | null;
}

/**
 * Reads the role messages of a guild.
 * @param db The database to read through.
 * @param guildId The guild's ID.
 */
export async function fetchRoleMessages(db: Database, guildId: Snowflake): Promise<RoleMessage[]> {
	const rows = await db.orm.public.GuildRoleMessage.where({ guildId: BigInt(guildId) }).all();
	return rows
		.sort((a, b) => (a.id < b.id ? -1 : 1))
		.map((row) => ({ roleId: String(row.roleId), channelId: String(row.channelId), added: row.added, removed: row.removed }));
}

/**
 * Sets the messages of a role, replacing the ones it had, and creates the `Guild` row they reference when the guild
 * has none yet.
 * @returns Whether they were new.
 */
export async function setRoleMessage(db: Database, guildId: Snowflake, data: RoleMessage, language = 'en-US'): Promise<boolean> {
	const id = BigInt(guildId);
	const roleId = BigInt(data.roleId);
	const columns = { channelId: BigInt(data.channelId), added: data.added, removed: data.removed };

	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const messages = tx.orm.public.GuildRoleMessage;
		const count = await messages.where({ guildId: id, roleId }).updateAndCount(columns);
		if (Number(count) > 0) return false;

		await messages.create({ guildId: id, roleId, ...columns });
		return true;
	});
}

/**
 * Removes the messages of a role.
 * @returns Whether the guild had them.
 */
export async function deleteRoleMessage(db: Database, guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.GuildRoleMessage.where({ guildId: BigInt(guildId), roleId: BigInt(roleId) }).deleteAndCount();
	return Number(count) > 0;
}
