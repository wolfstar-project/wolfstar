#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/671621c871ec121dcb957a66e8c1763d52cd3fed7e9bc8da89aa5e0f6c232235/contract';
import startContract from '../../snapshots/671621c871ec121dcb957a66e8c1763d52cd3fed7e9bc8da89aa5e0f6c232235/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/51621eb17b94d7fd7d2af00222cad343960396522cf89d91478c095e514dec5b/contract';
import endContract from '../../snapshots/51621eb17b94d7fd7d2af00222cad343960396522cf89d91478c095e514dec5b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the column is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildModeration.dehoist',
				label: 'Add the setting that dehoists the names of the members',
				summary: 'Adds column "dehoist" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, off for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "dehoist" bool NOT NULL DEFAULT false`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "dehoist" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'dehoist') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
