#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/29b558902154533a4947a7b32db43b162084ac89bbe2ad00c2ea77814c276e5e/contract';
import startContract from '../../snapshots/29b558902154533a4947a7b32db43b162084ac89bbe2ad00c2ea77814c276e5e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cdc02b1afa8004f51c20e82ead9f57e154a2a835bf2182e0a3e9e923f41dbf6a/contract';
import endContract from '../../snapshots/cdc02b1afa8004f51c20e82ead9f57e154a2a835bf2182e0a3e9e923f41dbf6a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				column: col('log_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				column: col('response', 'text', { codecRef: { codecId: 'pg/text@1' } })
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
