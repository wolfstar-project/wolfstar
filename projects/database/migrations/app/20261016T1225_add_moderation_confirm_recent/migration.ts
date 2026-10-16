#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/55e7fe64165356d06c0903bec91d4e8a1d8c8181079de85262c29221c276a9a4/contract';
import endContract from '../../snapshots/55e7fe64165356d06c0903bec91d4e8a1d8c8181079de85262c29221c276a9a4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/999a384f7d3b24f0c245bfa28531acfe679bce0cdefe1c4d8e7f7e7ebc606c3c/contract';
import startContract from '../../snapshots/999a384f7d3b24f0c245bfa28531acfe679bce0cdefe1c4d8e7f7e7ebc606c3c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the column is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildModeration.confirm_recent_minutes',
				label: 'Add the setting that asks to confirm a punishment when the member has a recent case',
				summary: 'Adds column "confirm_recent_minutes" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, 0 (never asking) for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "confirm_recent_minutes" int4 NOT NULL DEFAULT 0`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "confirm_recent_minutes" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'confirm_recent_minutes') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
