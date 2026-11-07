import type { Database } from '../index.js';
import type { Snowflake } from 'discord-api-types/v10';

type Orm = Database['orm'];

/**
 * The guilds whose `permissions.users` or `permissions.roles` holds an entry, a legacy node or a dashboard access rule:
 * the ones the conversion of the legacy nodes into command rules looks at. It reads the whole table, which only the
 * conversion does, once.
 *
 * @param orm - The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 */
export async function fetchGuildIdsWithPermissionNodes(orm: Orm): Promise<Snowflake[]> {
	const rows = await orm.public.GuildPermissions.all();
	return rows.filter((row) => row.users.length > 0 || row.roles.length > 0).map((row) => String(row.id));
}
