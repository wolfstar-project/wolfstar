import type { Snowflake } from 'discord-api-types/v10';
import type { Database, Models } from '../index.js';
import { formatTimestamp } from '../settings/time.js';

type Orm = Database['orm'];
type Timestamp = Models.public_LegacyMigratedGuild['migratedAt'];

/**
 * The guilds the conversion imported, what needs Discord still to be done.
 *
 * @param orm - The ORM surface to read through.
 */
export async function fetchPendingLegacyFollowUps(orm: Orm): Promise<Snowflake[]> {
	const rows = await orm.public.LegacyMigratedGuild.where({ followedUpAt: null }).all();
	return rows.map((row) => String(row.guildId));
}

/**
 * Marks a guild as done with what needs Discord.
 *
 * @param orm - The ORM surface to write through.
 * @param guildId - The guild.
 */
export async function markLegacyFollowUp(orm: Orm, guildId: Snowflake): Promise<void> {
	await orm.public.LegacyMigratedGuild.where({ guildId: BigInt(guildId) }).updateAll({ followedUpAt: formatTimestamp(Date.now()) as Timestamp });
}
