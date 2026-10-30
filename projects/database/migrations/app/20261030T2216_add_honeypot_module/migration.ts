#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/9286a43801b733d0730e1935ea8cc73a9a908e061fa77132baae20a0cf2e1fbc/contract';
import endContract from '../../snapshots/9286a43801b733d0730e1935ea8cc73a9a908e061fa77132baae20a0cf2e1fbc/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7/contract';
import startContract from '../../snapshots/f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7/contract.json' with { type: 'json' };
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
