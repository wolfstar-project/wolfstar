#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8058a0d5a801e52165cffbe3a6a0d05c6a1b67fc6334c8c3ae3cc882821aac52/contract';
import endContract from '../../snapshots/8058a0d5a801e52165cffbe3a6a0d05c6a1b67fc6334c8c3ae3cc882821aac52/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/980f5019a421514b9b713739be153f8bf60a883b77e35c2ffc8f26e013572c7d/contract';
import startContract from '../../snapshots/980f5019a421514b9b713739be153f8bf60a883b77e35c2ffc8f26e013572c7d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'ModerationCaseEdit',
				columns: [
					col('case_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('changes', '"jsonb"', {
						notNull: true,
						default: fn("'[]'::jsonb"),
						codecRef: {
							codecId: 'typed/json@1',
							typeParams: { tsType: 'PrismaJson.ModerationCaseEditChanges' }
						}
					}),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('moderator_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'ModerationCaseEdit_pkey' })]
			}),
			this.addColumn({
				schema: 'public',
				table: 'ModerationCaseData',
				column: col('proof_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			}),
			this.addColumn({
				schema: 'public',
				table: 'ModerationCaseData',
				column: col('proof_message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			}),
			this.addColumn({
				schema: 'public',
				table: 'ModerationCaseData',
				column: col('staff_note', 'text', { codecRef: { codecId: 'pg/text@1' } })
			}),
			this.createIndex({
				schema: 'public',
				table: 'ModerationCaseEdit',
				index: 'ModerationCaseEdit_guild_id_case_id_idx',
				columns: ['guild_id', 'case_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'ModerationCaseEdit',
				foreignKey: {
					name: 'ModerationCaseEdit_guild_id_fkey',
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
