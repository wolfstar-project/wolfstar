#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1af249406d3aacb1bee2140bca52aef61203e6d7cbacbf4127e95cc3acd9904e/contract';
import endContract from '../../snapshots/1af249406d3aacb1bee2140bca52aef61203e6d7cbacbf4127e95cc3acd9904e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c43f2589cd8e65306a24f8c685dddf640e494f3301c6087bfe5da06da7e4412c/contract';
import startContract from '../../snapshots/c43f2589cd8e65306a24f8c685dddf640e494f3301c6087bfe5da06da7e4412c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'HoneypotAction',
				members: ['Kick', 'Softban', 'Ban']
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildHoneypot',
				columns: [
					col('action', '"HoneypotAction"', {
						notNull: true,
						default: lit('Softban'),
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'HoneypotAction' } }
					}),
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('direct_message', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('keep_active', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('log_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('random_name', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('warning', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildHoneypot_pkey' })]
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildHoneypot',
				foreignKey: {
					name: 'GuildHoneypot_id_fkey',
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
