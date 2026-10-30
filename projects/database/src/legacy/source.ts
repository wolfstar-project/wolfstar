import type { LegacyRow } from './types.js';

/**
 * What the conversion needs of a connection: `pg`'s client has it.
 */
export interface LegacyClient {
	query<Row extends object = Record<string, any>>(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}

/** The legacy tables, by their name. The website renames them to `<name>_v6` when it moves to the new schema. */
const LegacyTables = ['guilds', 'moderation', 'user', 'audit_event', 'audit_chain_head', 'command_log'] as const;
export type LegacyTable = (typeof LegacyTables)[number];

const ArchivedSuffix = '_v6';

/**
 * Finds the legacy tables of a database, under either name.
 */
export async function findLegacyTables(client: LegacyClient): Promise<Set<string>> {
	const names = LegacyTables.flatMap((table) => [table, `${table}${ArchivedSuffix}`]);
	const { rows } = await client.query<{ table_name: string }>(
		`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
		[names]
	);
	return new Set(rows.map((row) => row.table_name));
}

/**
 * Reads a legacy table, under each name it has: a backup restored after the website renamed the tables leaves both.
 *
 * @param client - The connection.
 * @param found - The tables of the database, see {@linkcode findLegacyTables}.
 * @param table - The table.
 * @param key - What identifies a row: the first one read wins, the one of the table under its own name.
 */
export async function readLegacyRows(
	client: LegacyClient,
	found: ReadonlySet<string>,
	table: LegacyTable,
	key: (row: LegacyRow) => string
): Promise<LegacyRow[]> {
	const rows = new Map<string, LegacyRow>();
	for (const name of [table, `${table}${ArchivedSuffix}`]) {
		if (!found.has(name)) continue;

		const result = await client.query<{ row: LegacyRow }>(`SELECT to_jsonb(t) AS row FROM "${name}" AS t`);
		for (const { row } of result.rows) {
			const id = key(row);
			if (!rows.has(id)) rows.set(id, row);
		}
	}

	return [...rows.values()];
}
