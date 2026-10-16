#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/55146b09673d36af4a60a5e01d2d7f542ac3750307354863c110049792c38dd1/contract';
import endContract from '../../snapshots/55146b09673d36af4a60a5e01d2d7f542ac3750307354863c110049792c38dd1/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/8356b07843fa65358d89980593a4c4e2c076a739225933f31901024c188dc783/contract';
import startContract from '../../snapshots/8356b07843fa65358d89980593a4c4e2c076a739225933f31901024c188dc783/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'GuildWarnThreshold',
				columns: [
					col('action', '"GuildAutoModerationHardAction"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'GuildAutoModerationHardAction' }
						}
					}),
					col('count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('duration', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('period', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildWarnThreshold_pkey' })]
			}),
			this.addUnique({
				schema: 'public',
				table: 'GuildWarnThreshold',
				constraint: 'GuildWarnThreshold_guild_id_count_key',
				columns: ['guild_id', 'count']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildWarnThreshold',
				foreignKey: {
					name: 'GuildWarnThreshold_guild_id_fkey',
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
