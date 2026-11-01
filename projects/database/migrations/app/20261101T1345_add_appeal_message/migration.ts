#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7a8fb70d0366577d294a714d8284aae00481ab74484064804a040bde7486a8b7/contract';
import startContract from '../../snapshots/7a8fb70d0366577d294a714d8284aae00481ab74484064804a040bde7486a8b7/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bd5ea1af98122288144902d4589ba48c4d7f39ed8f9d81802738d2b4549fd148/contract';
import endContract from '../../snapshots/bd5ea1af98122288144902d4589ba48c4d7f39ed8f9d81802738d2b4549fd148/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				schema: 'public',
				table: 'Appeal',
				column: col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			}),
			this.addColumn({
				schema: 'public',
				table: 'Appeal',
				column: col('message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
