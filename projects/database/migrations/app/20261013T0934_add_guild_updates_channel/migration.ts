#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/798368868c1b3b6b753df0fa5ea625162d0a2c38691073c3640a329d415ea83a/contract';
import startContract from '../../snapshots/798368868c1b3b6b753df0fa5ea625162d0a2c38691073c3640a329d415ea83a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ab554f53d4572afa6c140bc0eaeb9c16c929ffd55b27544bd803c01171365413/contract';
import endContract from '../../snapshots/ab554f53d4572afa6c140bc0eaeb9c16c929ffd55b27544bd803c01171365413/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the guilds is owned outside this repository, so the planner has nothing to do for it and the column
			// is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.Guild.updates_channel_id',
				label: 'Add the updates channel of a guild',
				summary: 'Adds column "updates_channel_id" to "Guild" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'Guild' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no updates channel',
						sql: `ALTER TABLE "public"."Guild" ADD COLUMN IF NOT EXISTS "updates_channel_id" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "updates_channel_id" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Guild' AND column_name = 'updates_channel_id') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
