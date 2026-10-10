#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/17d322e0a6f7750f664ce602c9a86b3d0910800b4eba4175829971b68535c110/contract';
import endContract from '../../snapshots/17d322e0a6f7750f664ce602c9a86b3d0910800b4eba4175829971b68535c110/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7c9b01289a418ee401d3f17deaf157aa5fa2d3f4cc6a6ee7e9c822cdd10780e5/contract';
import startContract from '../../snapshots/7c9b01289a418ee401d3f17deaf157aa5fa2d3f4cc6a6ee7e9c822cdd10780e5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildAutoDelete',
				columns: [
					col('allow', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					}),
					col('bots', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('channel_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('delay', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildAutoDelete_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildAutoPurge',
				columns: [
					col('channel_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('filter', 'text', {
						notNull: true,
						default: lit('any'),
						codecRef: { codecId: 'pg/text@1' }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('interval', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('next_run_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('value', 'text', { codecRef: { codecId: 'pg/text@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildAutoPurge_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildAutoDelete',
				constraint: 'GuildAutoDelete_channel_id_key',
				columns: ['channel_id']
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildAutoPurge',
				constraint: 'GuildAutoPurge_channel_id_key',
				columns: ['channel_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildAutoDelete',
				index: 'GuildAutoDelete_guild_id_idx',
				columns: ['guild_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildAutoPurge',
				index: 'GuildAutoPurge_guild_id_idx',
				columns: ['guild_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildAutoPurge',
				index: 'GuildAutoPurge_next_run_at_idx',
				columns: ['next_run_at']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildAutoDelete',
				foreignKey: {
					name: 'GuildAutoDelete_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildAutoPurge',
				foreignKey: {
					name: 'GuildAutoPurge_guild_id_fkey',
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
