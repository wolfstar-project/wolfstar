#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/980a69acebd0d8ba87c3b64fcce3e72325a3a5991ddddd78f5edfdaae605d7ff/contract';
import endContract from '../../snapshots/980a69acebd0d8ba87c3b64fcce3e72325a3a5991ddddd78f5edfdaae605d7ff/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e77de9a6ac3729c3bc50c1813a85b5ac49ebfdf8ad67791eee497dae9df5f081/contract';
import startContract from '../../snapshots/e77de9a6ac3729c3bc50c1813a85b5ac49ebfdf8ad67791eee497dae9df5f081/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'Appeal',
				columns: [
					col('answers', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					}),
					col('case_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('reviewer_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('status', 'text', {
						notNull: true,
						default: lit('pending'),
						codecRef: { codecId: 'pg/text@1' }
					}),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'Appeal_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildAppeals',
				columns: [
					col('bans', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('enabled', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('mutes', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('questions', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					}),
					col('timeouts', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildAppeals_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'Appeal',
				constraint: 'Appeal_guild_id_case_id_key',
				columns: ['guild_id', 'case_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'Appeal',
				foreignKey: {
					name: 'Appeal_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildAppeals',
				foreignKey: {
					name: 'GuildAppeals_id_fkey',
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
