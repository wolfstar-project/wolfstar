#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/d9315ae105942ffee9030c3d31b996bb4a1191fb9cbc13af0df577c105fdde44/contract';
import startContract from '../../snapshots/d9315ae105942ffee9030c3d31b996bb4a1191fb9cbc13af0df577c105fdde44/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ee006af9ea392127ccb6872e47e407f7ca7c78848860ac799057936e72cbfd87/contract';
import endContract from '../../snapshots/ee006af9ea392127ccb6872e47e407f7ca7c78848860ac799057936e72cbfd87/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildAutoModerationZalgo',
				columns: [
					col('enabled', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
					col('hard_action', '"GuildAutoModerationHardAction"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'GuildAutoModerationHardAction' }
						}
					}),
					col('hard_action_duration', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('ignored_channels', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('ignored_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('maximum', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('soft_action', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('threshold_duration', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('threshold_maximum', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildAutoModerationZalgo_pkey' })]
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildAutoModerationZalgo',
				foreignKey: {
					name: 'GuildAutoModerationZalgo_id_fkey',
					columns: ['id'],
					references: { schema: 'public', table: 'GuildAutoModeration', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
