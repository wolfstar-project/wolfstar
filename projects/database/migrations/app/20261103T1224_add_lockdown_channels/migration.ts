#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b645a1f439801e9d6bf8f1a3597b2061dd4092db419f72f6d9b80f52e1e4d5d8/contract';
import endContract from '../../snapshots/b645a1f439801e9d6bf8f1a3597b2061dd4092db419f72f6d9b80f52e1e4d5d8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract';
import startContract from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the column is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildModeration.lockdown_channels',
				label: 'Add the channels a lockdown locks together',
				summary: 'Adds column "lockdown_channels" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, empty for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "lockdown_channels" int8[] NOT NULL DEFAULT '{}'::int8[]`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "lockdown_channels" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'lockdown_channels') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
