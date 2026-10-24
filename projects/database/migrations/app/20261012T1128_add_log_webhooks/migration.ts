#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7cab1e30bdc1a0db660378d4b67e9c3bf1872a4700136ef17efc375619b25a37/contract';
import startContract from '../../snapshots/7cab1e30bdc1a0db660378d4b67e9c3bf1872a4700136ef17efc375619b25a37/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c752dc8f0b1d3df16e8c3b1609ce01a269f1a7551bae730bc9cbd8c0f4c17fcc/contract';
import endContract from '../../snapshots/c752dc8f0b1d3df16e8c3b1609ce01a269f1a7551bae730bc9cbd8c0f4c17fcc/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				schema: 'public',
				table: 'GuildLogsOptions',
				column: col('webhooks', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
