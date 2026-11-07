#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/641b2424c94b1d8aae03a609cc7f4b997f763331f89e6027d80b6add2707af00/contract';
import startContract from '../../snapshots/641b2424c94b1d8aae03a609cc7f4b997f763331f89e6027d80b6add2707af00/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c2c838893d4b33fbfa4dca0f5d2fbc5eabe57121ccd09cb444b3bc607694e52c/contract';
import endContract from '../../snapshots/c2c838893d4b33fbfa4dca0f5d2fbc5eabe57121ccd09cb444b3bc607694e52c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the logs is owned outside this repository, so the planner has nothing to do for it and the columns
			// are added by hand. They are only added when they are not there: the migrations of the website may add them first.
			rawSql({
				id: 'column.GuildLogs.invites',
				label: 'Add the channel of the invites log',
				summary: 'Adds column "invites" to "GuildLogs" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildLogs' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no channel for it',
						sql: `ALTER TABLE "public"."GuildLogs" ADD COLUMN IF NOT EXISTS "invites" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "invites" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildLogs' AND column_name = 'invites') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildLogs.threads',
				label: 'Add the channel of the threads log',
				summary: 'Adds column "threads" to "GuildLogs" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildLogs' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no channel for it',
						sql: `ALTER TABLE "public"."GuildLogs" ADD COLUMN IF NOT EXISTS "threads" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "threads" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildLogs' AND column_name = 'threads') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildLogs.events',
				label: 'Add the channel of the events log',
				summary: 'Adds column "events" to "GuildLogs" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildLogs' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no channel for it',
						sql: `ALTER TABLE "public"."GuildLogs" ADD COLUMN IF NOT EXISTS "events" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "events" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildLogs' AND column_name = 'events') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildLogs.expressions',
				label: 'Add the channel of the expressions log',
				summary: 'Adds column "expressions" to "GuildLogs" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildLogs' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no channel for it',
						sql: `ALTER TABLE "public"."GuildLogs" ADD COLUMN IF NOT EXISTS "expressions" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "expressions" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildLogs' AND column_name = 'expressions') AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'column.GuildLogs.integrations',
				label: 'Add the channel of the integrations log',
				summary: 'Adds column "integrations" to "GuildLogs" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildLogs' } },
				precheck: [],
				execute: [
					{
						description: 'add the nullable column, so the guilds that are there have no channel for it',
						sql: `ALTER TABLE "public"."GuildLogs" ADD COLUMN IF NOT EXISTS "integrations" int8`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "integrations" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildLogs' AND column_name = 'integrations') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
