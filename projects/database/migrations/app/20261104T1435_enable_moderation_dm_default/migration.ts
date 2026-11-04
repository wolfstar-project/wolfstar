#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2bd6519063c2dd6fd637ddb28ff975f72b2dec8b3d9d05977dadd774ee5789e0/contract';
import startContract from '../../snapshots/2bd6519063c2dd6fd637ddb28ff975f72b2dec8b3d9d05977dadd774ee5789e0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/84c9e9ab8b0b53ae2a42523d017f8e668834ca4b6d1e88b52e6ecf65c14d3e68/contract';
import endContract from '../../snapshots/84c9e9ab8b0b53ae2a42523d017f8e668834ca4b6d1e88b52e6ecf65c14d3e68/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			rawSql({
				id: 'GuildModeration.directMessage.default',
				label: 'Enable moderation direct messages by default',
				summary: 'Changes the default for new rows without changing existing preferences',
				operationClass: 'additive',
				target: { id: 'postgres', details: { schema: 'public', table: 'GuildModeration', column: 'direct_message' } },
				precheck: [],
				execute: [
					{
						description: 'set the direct message default',
						sql: 'ALTER TABLE "public"."GuildModeration" ALTER COLUMN "direct_message" SET DEFAULT true',
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify the direct message default',
						sql: `SELECT column_default = 'true' AS result FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'GuildModeration' AND column_name = 'direct_message'`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
