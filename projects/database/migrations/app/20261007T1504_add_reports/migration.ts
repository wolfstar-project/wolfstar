#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/924bef5ebc429f5fbdccd88a71eb89cf56f3dd306680c642a9a7a602022d3097/contract';
import endContract from '../../snapshots/924bef5ebc429f5fbdccd88a71eb89cf56f3dd306680c642a9a7a602022d3097/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/decaa6be52016fc91730f487d1901ea7e68f2e71ddd4456da03dae095f90ee44/contract';
import startContract from '../../snapshots/decaa6be52016fc91730f487d1901ea7e68f2e71ddd4456da03dae095f90ee44/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildReports',
				columns: [
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('role_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildReports_pkey' })]
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildReports',
				foreignKey: {
					name: 'GuildReports_id_fkey',
					columns: ['id'],
					references: { schema: 'public', table: 'Modules', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
