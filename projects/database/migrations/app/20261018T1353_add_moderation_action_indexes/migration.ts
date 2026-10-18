#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b9f10ec5932d4ecefaac00c7ff18be11902f560092898f49e13fe68416a165c1/contract';
import endContract from '../../snapshots/b9f10ec5932d4ecefaac00c7ff18be11902f560092898f49e13fe68416a165c1/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ba952aa49cb805d9444eee38008cd730b9751e9b867a702d75fb04010a45ce5a/contract';
import startContract from '../../snapshots/ba952aa49cb805d9444eee38008cd730b9751e9b867a702d75fb04010a45ce5a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Creates an index of `ModerationAction` when it is not there. The table is owned outside this repository, so the planner
 * has nothing to do for it, and the migrations of the website may create the index first.
 */
function createIndex(name: string, columns: readonly string[], label: string) {
	const regclass = `"public"."${name}"`;
	return rawSql({
		id: `index.ModerationAction.${name}`,
		label,
		summary: `Creates index "${name}" on "ModerationAction" when it does not have it`,
		operationClass: 'additive',
		target: { id: 'postgres', details: { schema: 'public', objectType: 'index', name, table: 'ModerationAction' } },
		precheck: [],
		execute: [
			{
				description: `create index "${name}"`,
				sql: `CREATE INDEX IF NOT EXISTS "${name}" ON "public"."ModerationAction" (${columns.map((column) => `"${column}"`).join(', ')})`,
				params: []
			}
		],
		postcheck: [
			{
				description: `verify index "${name}" exists`,
				sql: 'SELECT (to_regclass($1)) IS NOT NULL AS "result"',
				params: [regclass]
			}
		]
	});
}

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The cases of a guild, newest first (the moderation log of the dashboard): read backwards, the index gives
			// `created_at DESC, id DESC` with no sort.
			createIndex('ModerationAction_guild_id_created_at_id_idx', ['guild_id', 'created_at', 'id'], 'Index the cases of a guild by their date'),
			// The cases of a member, which the bot reads on every moderation command, warning, appeal and voice connection.
			createIndex(
				'ModerationAction_guild_id_target_id_created_at_idx',
				['guild_id', 'target_id', 'created_at'],
				'Index the cases of a member by their date'
			)
		];
	}
}

MigrationCLI.run(import.meta.url, M);
