#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7a8fb70d0366577d294a714d8284aae00481ab74484064804a040bde7486a8b7/contract';
import endContract from '../../snapshots/7a8fb70d0366577d294a714d8284aae00481ab74484064804a040bde7486a8b7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4e53a2b98e6ec369f4d6c099418afe9a8bd4628b40a1e483497e4c417ed39fb4/contract';
import startContract from '../../snapshots/4e53a2b98e6ec369f4d6c099418afe9a8bd4628b40a1e483497e4c417ed39fb4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the modules is owned outside this repository, so the planner has nothing to do for it and the column
			// is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.Modules.honeypot',
				label: 'Add the switch of the module of the honeypot',
				summary: 'Adds column "honeypot" to "Modules" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'Modules' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, on for the guilds that are there',
						sql: `ALTER TABLE "public"."Modules" ADD COLUMN IF NOT EXISTS "honeypot" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "honeypot" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Modules' AND column_name = 'honeypot') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
