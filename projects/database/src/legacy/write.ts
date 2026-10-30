import type { LegacyClient } from './source.js';
import type { InsertRow } from './types.js';

/**
 * Inserts the rows whose keys are free, of every unique key of the table: what the new schema already holds wins.
 * The columns a row does not name take their defaults.
 *
 * @param client - The connection.
 * @param table - The table, a name of the contract.
 * @param rows - The rows, keyed by column.
 * @returns How many were inserted.
 */
export async function insertMissing(client: LegacyClient, table: string, rows: readonly InsertRow[]): Promise<number> {
	if (rows.length === 0) return 0;

	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].map((column) => `"${column}"`).join(', ');
	const { rowCount } = await client.query(
		`INSERT INTO "${table}" (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb) ON CONFLICT DO NOTHING`,
		[JSON.stringify(rows)]
	);
	return rowCount ?? 0;
}
