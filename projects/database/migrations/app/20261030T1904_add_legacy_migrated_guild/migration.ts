#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/86a434c6928441364a2ed8374ee67825f4a7c1ddbf971e17549ce2484d26edd3/contract';
import startContract from '../../snapshots/86a434c6928441364a2ed8374ee67825f4a7c1ddbf971e17549ce2484d26edd3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/89aa14ab97b71e9b2f76f89c19fdadef1671c567b77471c57d3198bbbb1002cb/contract';
import endContract from '../../snapshots/89aa14ab97b71e9b2f76f89c19fdadef1671c567b77471c57d3198bbbb1002cb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'LegacyMigratedGuild',
				columns: [
					col('followed_up_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('migrated_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					})
				],
				constraints: [primaryKey(['guild_id'], { name: 'LegacyMigratedGuild_pkey' })]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
