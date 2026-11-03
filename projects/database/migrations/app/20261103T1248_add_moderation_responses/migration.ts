#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a74dd5a94643931c52c38b49e66ad56ea5b07040cb056bc2e1d63604e0807fc4/contract';
import endContract from '../../snapshots/a74dd5a94643931c52c38b49e66ad56ea5b07040cb056bc2e1d63604e0807fc4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract';
import startContract from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * The custom responses of the moderation commands, one column each, `null` for the text the bot writes itself.
 */
const Responses = ['ban', 'unban', 'softban', 'kick', 'mute', 'unmute'] as const;

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		// The table of the moderation settings is owned outside this repository, so the planner has nothing to do for it and
		// the columns are added by hand. They are only added when they are not there: the migrations of the website may add them first.
		return Responses.map((response) =>
			rawSql({
				id: `column.GuildModeration.response_${response}`,
				label: `Add the custom response of the ${response} commands`,
				summary: `Adds column "response_${response}" to "GuildModeration" when it does not have it`,
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildModeration' } },
				precheck: [],
				execute: [
					{
						description: 'add the column, empty for the guilds that are there',
						sql: `ALTER TABLE "public"."GuildModeration" ADD COLUMN IF NOT EXISTS "response_${response}" text`,
						params: []
					}
				],
				postcheck: [
					{
						description: `verify column "response_${response}" exists`,
						sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'response_${response}') AS "result"`,
						params: []
					}
				]
			})
		);
	}
}

MigrationCLI.run(import.meta.url, M);
