#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/798368868c1b3b6b753df0fa5ea625162d0a2c38691073c3640a329d415ea83a/contract';
import endContract from '../../snapshots/798368868c1b3b6b753df0fa5ea625162d0a2c38691073c3640a329d415ea83a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c752dc8f0b1d3df16e8c3b1609ce01a269f1a7551bae730bc9cbd8c0f4c17fcc/contract';
import startContract from '../../snapshots/c752dc8f0b1d3df16e8c3b1609ce01a269f1a7551bae730bc9cbd8c0f4c17fcc/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the guilds is owned outside this repository, so the planner has nothing to do for it and the column
			// is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.Guild.timezone',
				label: 'Add the time zone of a guild',
				summary: 'Adds column "timezone" to "Guild" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'Guild' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, with UTC for the guilds that are there',
						sql: `ALTER TABLE "public"."Guild" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "timezone" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Guild' AND column_name = 'timezone') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
