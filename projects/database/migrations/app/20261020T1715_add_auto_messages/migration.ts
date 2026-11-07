#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3caf372ba8f8ecbf88b50f5bd4eb44fd30f4ac1c4329f2b30fd26e1000872d9b/contract';
import endContract from '../../snapshots/3caf372ba8f8ecbf88b50f5bd4eb44fd30f4ac1c4329f2b30fd26e1000872d9b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/51621eb17b94d7fd7d2af00222cad343960396522cf89d91478c095e514dec5b/contract';
import startContract from '../../snapshots/51621eb17b94d7fd7d2af00222cad343960396522cf89d91478c095e514dec5b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildAutoMessage',
				columns: [
					col('channel_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('interval', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('last_message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('mentions', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('next_run_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildAutoMessage_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildAutoMessage',
				constraint: 'GuildAutoMessage_channel_id_key',
				columns: ['channel_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildAutoMessage',
				index: 'GuildAutoMessage_guild_id_idx',
				columns: ['guild_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildAutoMessage',
				index: 'GuildAutoMessage_next_run_at_idx',
				columns: ['next_run_at']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildAutoMessage',
				foreignKey: {
					name: 'GuildAutoMessage_guild_id_fkey',
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
