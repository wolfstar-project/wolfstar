#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/534e3f1dff9b8b7099c4103175e4fa5d0a0ab0ca025de2facd5c6927a1b4b596/contract';
import endContract from '../../snapshots/534e3f1dff9b8b7099c4103175e4fa5d0a0ab0ca025de2facd5c6927a1b4b596/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract';
import startContract from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract.json' with { type: 'json' };
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
