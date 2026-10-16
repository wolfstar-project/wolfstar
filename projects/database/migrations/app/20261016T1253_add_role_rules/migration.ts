#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/55146b09673d36af4a60a5e01d2d7f542ac3750307354863c110049792c38dd1/contract';
import startContract from '../../snapshots/55146b09673d36af4a60a5e01d2d7f542ac3750307354863c110049792c38dd1/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/641b2424c94b1d8aae03a609cc7f4b997f763331f89e6027d80b6add2707af00/contract';
import endContract from '../../snapshots/641b2424c94b1d8aae03a609cc7f4b997f763331f89e6027d80b6add2707af00/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildRoleRule',
				columns: [
					col('any_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('forbidden_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('required_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('role_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildRoleRule_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildRoleRule',
				constraint: 'GuildRoleRule_guild_id_role_id_key',
				columns: ['guild_id', 'role_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildRoleRule',
				foreignKey: {
					name: 'GuildRoleRule_guild_id_fkey',
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
