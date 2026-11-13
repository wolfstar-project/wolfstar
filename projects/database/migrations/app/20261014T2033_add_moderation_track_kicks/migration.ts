#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/52182c7c3cc36ef44a64600210f3e8fa342a81e0e53336cd751a61bb54bba117/contract';
import endContract from '../../snapshots/52182c7c3cc36ef44a64600210f3e8fa342a81e0e53336cd751a61bb54bba117/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c886704c78fe2ee3ae0b2e06b01a9bfff64882af1fa79af1e67b1ba8fdb896da/contract';
import startContract from '../../snapshots/c886704c78fe2ee3ae0b2e06b01a9bfff64882af1fa79af1e67b1ba8fdb896da/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the column is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildModeration.track_kicks',
				label: 'Add the setting that records the kicks made by hand',
				summary: 'Adds column "track_kicks" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, off for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "track_kicks" bool NOT NULL DEFAULT false`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "track_kicks" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'track_kicks') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
