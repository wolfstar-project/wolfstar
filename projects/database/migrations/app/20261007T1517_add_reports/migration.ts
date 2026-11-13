#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7c9b01289a418ee401d3f17deaf157aa5fa2d3f4cc6a6ee7e9c822cdd10780e5/contract';
import endContract from '../../snapshots/7c9b01289a418ee401d3f17deaf157aa5fa2d3f4cc6a6ee7e9c822cdd10780e5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/decaa6be52016fc91730f487d1901ea7e68f2e71ddd4456da03dae095f90ee44/contract';
import startContract from '../../snapshots/decaa6be52016fc91730f487d1901ea7e68f2e71ddd4456da03dae095f90ee44/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'ReportStatus',
				members: ['Open', 'Actioned', 'Dismissed']
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildReports',
				columns: [
					col('anonymous', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('blocked_users', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('notify', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('role_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildReports_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'Report',
				columns: [
					col('action', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('anonymous', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('attachments', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					}),
					col('case_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('closed_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('content', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('moderator_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('reporter_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('status', '"ReportStatus"', {
						notNull: true,
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'ReportStatus' } }
					}),
					col('target_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('target_tag', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'Report_pkey' })]
			}),
			this.createIndex({
				schema: 'public',
				table: 'Report',
				index: 'Report_guild_id_id_idx',
				columns: ['guild_id', 'id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'Report',
				index: 'Report_guild_id_target_id_idx',
				columns: ['guild_id', 'target_id']
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
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'Report',
				foreignKey: {
					name: 'Report_guild_id_fkey',
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
