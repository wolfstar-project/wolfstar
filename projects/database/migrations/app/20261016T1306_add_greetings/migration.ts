#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/426acd2737755a83a7bb67b5ffb68df71fe2c80762b073c03ebfb1dbcd2be6a3/contract';
import endContract from '../../snapshots/426acd2737755a83a7bb67b5ffb68df71fe2c80762b073c03ebfb1dbcd2be6a3/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c2c838893d4b33fbfa4dca0f5d2fbc5eabe57121ccd09cb444b3bc607694e52c/contract';
import startContract from '../../snapshots/c2c838893d4b33fbfa4dca0f5d2fbc5eabe57121ccd09cb444b3bc607694e52c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildGreetings',
				columns: [
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('join_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('join_direct', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('join_messages', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					}),
					col('leave_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('leave_messages', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildGreetings_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildRoleMessage',
				columns: [
					col('added', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('channel_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('removed', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('role_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildRoleMessage_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildRoleMessage',
				constraint: 'GuildRoleMessage_guild_id_role_id_key',
				columns: ['guild_id', 'role_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildGreetings',
				foreignKey: {
					name: 'GuildGreetings_id_fkey',
					columns: ['id'],
					references: { schema: 'public', table: 'Modules', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildRoleMessage',
				foreignKey: {
					name: 'GuildRoleMessage_guild_id_fkey',
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
