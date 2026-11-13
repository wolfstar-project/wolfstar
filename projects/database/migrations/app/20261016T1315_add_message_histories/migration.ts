#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/426acd2737755a83a7bb67b5ffb68df71fe2c80762b073c03ebfb1dbcd2be6a3/contract';
import startContract from '../../snapshots/426acd2737755a83a7bb67b5ffb68df71fe2c80762b073c03ebfb1dbcd2be6a3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e77de9a6ac3729c3bc50c1813a85b5ac49ebfdf8ad67791eee497dae9df5f081/contract';
import endContract from '../../snapshots/e77de9a6ac3729c3bc50c1813a85b5ac49ebfdf8ad67791eee497dae9df5f081/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'MessageHistory',
				columns: [
					col('case_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('expires_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('messages', '"jsonb"', {
						notNull: true,
						default: fn("'[]'::jsonb"),
						codecRef: {
							codecId: 'typed/json@1',
							typeParams: { tsType: 'PrismaJson.MessageHistoryMessages' }
						}
					}),
					col('moderator_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'MessageHistory_pkey' })]
			}),
			this.createIndex({
				schema: 'public',
				table: 'MessageHistory',
				index: 'MessageHistory_guild_id_idx',
				columns: ['guild_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'MessageHistory',
				foreignKey: {
					name: 'MessageHistory_guild_id_fkey',
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
