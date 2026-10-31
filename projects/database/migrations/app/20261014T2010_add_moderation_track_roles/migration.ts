#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/823cb1ccd629214ad474ab7e4b79f4ba79540558587da45754ec124a7078e7c5/contract';
import startContract from '../../snapshots/823cb1ccd629214ad474ab7e4b79f4ba79540558587da45754ec124a7078e7c5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c886704c78fe2ee3ae0b2e06b01a9bfff64882af1fa79af1e67b1ba8fdb896da/contract';
import endContract from '../../snapshots/c886704c78fe2ee3ae0b2e06b01a9bfff64882af1fa79af1e67b1ba8fdb896da/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the column is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildModeration.track_roles',
				label: 'Add the setting that records the muted and restriction roles given by hand',
				summary: 'Adds column "track_roles" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, off for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "track_roles" bool NOT NULL DEFAULT false`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "track_roles" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'track_roles') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
