#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b9f10ec5932d4ecefaac00c7ff18be11902f560092898f49e13fe68416a165c1/contract';
import startContract from '../../snapshots/b9f10ec5932d4ecefaac00c7ff18be11902f560092898f49e13fe68416a165c1/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/671621c871ec121dcb957a66e8c1763d52cd3fed7e9bc8da89aa5e0f6c232235/contract';
import endContract from '../../snapshots/671621c871ec121dcb957a66e8c1763d52cd3fed7e9bc8da89aa5e0f6c232235/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the logs is owned outside this repository, so the planner has nothing to do for it and the column is
			// added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildLogs.boosts',
				label: 'Add the channel of the boosts log',
				summary: 'Adds column "boosts" to "GuildLogs" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildLogs' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no channel for it',
						sql: `ALTER TABLE "public"."GuildLogs" ADD COLUMN IF NOT EXISTS "boosts" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "boosts" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildLogs' AND column_name = 'boosts') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
