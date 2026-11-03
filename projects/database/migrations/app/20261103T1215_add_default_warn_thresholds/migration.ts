#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0832606c10a9516825f7e16efe2c4665464b1cb5bd923e91b5287e16e5937ecf/contract';
import endContract from '../../snapshots/0832606c10a9516825f7e16efe2c4665464b1cb5bd923e91b5287e16e5937ecf/contract.json' with { type: 'json' };
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
			// The servers that are there keep the behaviour they had (no threshold until they add one), the ones that come
			// after get the defaults: the column is added off, and its default turned on for the rows made from now on.
			rawSql({
				id: 'column.GuildModeration.default_warn_thresholds',
				label: 'Add the switch of the default thresholds of warnings',
				summary:
					'Adds column "default_warn_thresholds" to "GuildModeration" when it does not have it, off for the guilds that are there and on for the ones to come',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, off for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "default_warn_thresholds" bool NOT NULL DEFAULT false`,
						params: []
					},
					{
						description: 'turn it on for the rows made from now on',
						sql: `ALTER TABLE "public"."GuildModeration" ALTER COLUMN "default_warn_thresholds" SET DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "default_warn_thresholds" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'default_warn_thresholds') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
