#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2e58ed3ca4db8fcf9c666b01bf4c6b7c9d95a91ebd426ba0d4e2700ad0a05b68/contract';
import endContract from '../../snapshots/2e58ed3ca4db8fcf9c666b01bf4c6b7c9d95a91ebd426ba0d4e2700ad0a05b68/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/3caf372ba8f8ecbf88b50f5bd4eb44fd30f4ac1c4329f2b30fd26e1000872d9b/contract';
import startContract from '../../snapshots/3caf372ba8f8ecbf88b50f5bd4eb44fd30f4ac1c4329f2b30fd26e1000872d9b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the modules is owned outside this repository, so the planner has nothing to do for it and the columns
			// are added by hand. They are only added when they are not there: the migrations of the website may add them first.
			rawSql({
				id: 'column.Modules.autodelete',
				label: 'Add the switch of the module of the automatic deletions',
				summary: 'Adds column "autodelete" to "Modules" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'Modules' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, on for the guilds that are there',
						sql: `ALTER TABLE "public"."Modules" ADD COLUMN IF NOT EXISTS "autodelete" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "autodelete" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Modules' AND column_name = 'autodelete') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.Modules.autopurge',
				label: 'Add the switch of the module of the automatic purges',
				summary: 'Adds column "autopurge" to "Modules" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'Modules' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, on for the guilds that are there',
						sql: `ALTER TABLE "public"."Modules" ADD COLUMN IF NOT EXISTS "autopurge" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "autopurge" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Modules' AND column_name = 'autopurge') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.Modules.automessage',
				label: 'Add the switch of the module of the automatic messages',
				summary: 'Adds column "automessage" to "Modules" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'Modules' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, on for the guilds that are there',
						sql: `ALTER TABLE "public"."Modules" ADD COLUMN IF NOT EXISTS "automessage" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "automessage" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Modules' AND column_name = 'automessage') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
