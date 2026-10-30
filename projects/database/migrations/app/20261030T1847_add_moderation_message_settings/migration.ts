#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/86a434c6928441364a2ed8374ee67825f4a7c1ddbf971e17549ce2484d26edd3/contract';
import endContract from '../../snapshots/86a434c6928441364a2ed8374ee67825f4a7c1ddbf971e17549ce2484d26edd3/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b461f6bcef5ad06a5652db38883f008f1d6e4dc4835aa1bae28f394d71da9a2e/contract';
import startContract from '../../snapshots/b461f6bcef5ad06a5652db38883f008f1d6e4dc4835aa1bae28f394d71da9a2e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the columns are added by hand. They are only added when they are not there: the migrations of the website may add them first.
			rawSql({
				id: 'column.GuildModeration.direct_message',
				label: 'Add the setting of direct messages to the members',
				summary: 'Adds column "direct_message" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, with its default for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "direct_message" bool NOT NULL DEFAULT false`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "direct_message" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'direct_message') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildModeration.display_reason',
				label: 'Add the setting of showing the reason',
				summary: 'Adds column "display_reason" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, with its default for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "display_reason" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "display_reason" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'display_reason') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildModeration.display_message',
				label: 'Add the setting of answering in the channel',
				summary: 'Adds column "display_message" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, with its default for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "display_message" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "display_message" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'display_message') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildModeration.display_moderator',
				label: 'Add the setting of showing the moderator',
				summary: 'Adds column "display_moderator" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, with its default for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "display_moderator" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "display_moderator" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'display_moderator') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
