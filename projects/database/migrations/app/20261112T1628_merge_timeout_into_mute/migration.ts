#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/72302aa1902feb1df8535fe7a90d2ef07e9a6a979940db5415ca1073f7ebe88d/contract';
import endContract from '../../snapshots/72302aa1902feb1df8535fe7a90d2ef07e9a6a979940db5415ca1073f7ebe88d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/84c9e9ab8b0b53ae2a42523d017f8e668834ca4b6d1e88b52e6ecf65c14d3e68/contract';
import startContract from '../../snapshots/84c9e9ab8b0b53ae2a42523d017f8e668834ca4b6d1e88b52e6ecf65c14d3e68/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
			// the column is added by hand. It is only added when it is not there: the migrations of the website may add it first.
			rawSql({
				id: 'column.GuildModeration.mute_timeout',
				label: 'Add the setting that makes a mute a Discord timeout when its duration fits one',
				summary: 'Adds column "mute_timeout" to "GuildModeration" when it does not have it',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, on for the guilds that are there, so their timeouts stay timeouts',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "mute_timeout" bool NOT NULL DEFAULT true`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify column "mute_timeout" exists',
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'mute_timeout') AS "result"`,
						params: []
					}
				]
			}),
			// `Timeout` stays in the native enum, which cannot drop a value, but nothing is saved as one any longer: it is a
			// `Mute`, which times the member out while the new setting is on and the duration fits a Discord timeout.
			rawSql({
				id: 'data.GuildAutoModerationRule.timeout_to_mute',
				label: 'Make the Timeout of the auto-moderation rules a Mute',
				summary: 'Sets "hard_action" and the actions of "escalation" from Timeout to Mute',
				operationClass: 'data',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildAutoModerationRule' } },
				precheck: [],
				execute: [
					{
						description: 'make the hard actions a Mute',
						sql: `UPDATE "public"."GuildAutoModerationRule" SET "hard_action" = 'Mute' WHERE "hard_action" = 'Timeout'`,
						params: []
					},
					{
						description: 'make the steps of the escalations a Mute, in their order',
						sql: `UPDATE "public"."GuildAutoModerationRule" SET "escalation" = (SELECT jsonb_agg(CASE WHEN "step"->>'action' = 'Timeout' THEN jsonb_set("step", '{action}', '"Mute"') ELSE "step" END ORDER BY "position") FROM jsonb_array_elements("escalation") WITH ORDINALITY AS "steps"("step", "position")) WHERE jsonb_typeof("escalation") = 'array' AND "escalation" @> '[{"action":"Timeout"}]'::jsonb`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify no rule takes a Timeout',
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."GuildAutoModerationRule" WHERE "hard_action" = 'Timeout' OR (jsonb_typeof("escalation") = 'array' AND "escalation" @> '[{"action":"Timeout"}]'::jsonb)) AS "result"`,
						params: []
					}
				]
			}),
			rawSql({
				id: 'data.GuildWarnThreshold.timeout_to_mute',
				label: 'Make the Timeout of the thresholds of warnings a Mute',
				summary: 'Sets "action" from Timeout to Mute',
				operationClass: 'data',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildWarnThreshold' } },
				precheck: [],
				execute: [
					{
						description: 'make the actions a Mute',
						sql: `UPDATE "public"."GuildWarnThreshold" SET "action" = 'Mute' WHERE "action" = 'Timeout'`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify no threshold takes a Timeout',
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."GuildWarnThreshold" WHERE "action" = 'Timeout') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
