#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/52182c7c3cc36ef44a64600210f3e8fa342a81e0e53336cd751a61bb54bba117/contract';
import startContract from '../../snapshots/52182c7c3cc36ef44a64600210f3e8fa342a81e0e53336cd751a61bb54bba117/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/999a384f7d3b24f0c245bfa28531acfe679bce0cdefe1c4d8e7f7e7ebc606c3c/contract';
import endContract from '../../snapshots/999a384f7d3b24f0c245bfa28531acfe679bce0cdefe1c4d8e7f7e7ebc606c3c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildModerationReason',
				columns: [
					col('alias', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildModerationReason_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildModerationReason',
				constraint: 'GuildModerationReason_guild_id_alias_key',
				columns: ['guild_id', 'alias']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildModerationReason',
				foreignKey: {
					name: 'GuildModerationReason_guild_id_fkey',
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
