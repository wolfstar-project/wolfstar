#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c43f2589cd8e65306a24f8c685dddf640e494f3301c6087bfe5da06da7e4412c/contract';
import endContract from '../../snapshots/c43f2589cd8e65306a24f8c685dddf640e494f3301c6087bfe5da06da7e4412c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cb003055e429e62af44e664ada0e9b2ef69c00a87b2c2d9209f445f93eaa6f18/contract';
import startContract from '../../snapshots/cb003055e429e62af44e664ada0e9b2ef69c00a87b2c2d9209f445f93eaa6f18/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'ModerationCaseData',
				columns: [
					col('case_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('extra_data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['case_id', 'guild_id'], { name: 'ModerationCaseData_pkey' })]
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'ModerationCaseData',
				foreignKey: {
					name: 'ModerationCaseData_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
