#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/772e28567a17447a20c52589459c840951f08a904b796fc0d715a4855883c4a7/contract';
import endContract from '../../snapshots/772e28567a17447a20c52589459c840951f08a904b796fc0d715a4855883c4a7/contract.json' with { type: 'json' };
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
				typeName: 'MessageUpdateStyle',
				members: ['Difference', 'Separate']
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildLogsOptions',
				columns: [
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('message_update_style', '"MessageUpdateStyle"', {
						notNull: true,
						default: lit('Difference'),
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'MessageUpdateStyle' } }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildLogsOptions_pkey' })]
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildLogsOptions',
				foreignKey: {
					name: 'GuildLogsOptions_id_fkey',
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
