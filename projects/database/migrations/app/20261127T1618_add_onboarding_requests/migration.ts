#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/980f5019a421514b9b713739be153f8bf60a883b77e35c2ffc8f26e013572c7d/contract';
import startContract from '../../snapshots/980f5019a421514b9b713739be153f8bf60a883b77e35c2ffc8f26e013572c7d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fe05809351ab28fff50787605a5eb6005622ebd489a8eaf10458bc4da6ada3c0/contract';
import endContract from '../../snapshots/fe05809351ab28fff50787605a5eb6005622ebd489a8eaf10458bc4da6ada3c0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

const PendingIndex = 'OnboardingRequest_created_at_pending_idx';

// The requests the bot did not handle yet, which it sweeps in case a notification was lost. PSL cannot say a partial
// index, so it is made by hand, as the ones of `AppealRequest` and `JoinGuardRequest` are:
const pendingIndex = rawSql({
	id: `index.OnboardingRequest.${PendingIndex}`,
	label: `Create the index ${PendingIndex}`,
	summary: `Creates ${PendingIndex} on "OnboardingRequest"`,
	operationClass: 'additive',
	target: { id: 'postgres', details: { schema: 'public', objectType: 'index', name: PendingIndex, table: 'OnboardingRequest' } },
	precheck: [],
	execute: [
		{
			description: `create ${PendingIndex}`,
			sql: `CREATE INDEX "${PendingIndex}" ON "public"."OnboardingRequest" ("created_at") WHERE "processed_at" IS NULL`,
			params: []
		}
	],
	postcheck: [
		{
			description: `verify ${PendingIndex} exists`,
			sql: `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = '${PendingIndex}') AS "result"`,
			params: []
		}
	]
});

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'OnboardingRequest',
				columns: [
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('processed_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('verification_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'OnboardingRequest_pkey' })]
			}),
			this.createIndex({
				schema: 'public',
				table: 'OnboardingRequest',
				index: 'OnboardingRequest_guild_id_created_at_idx',
				columns: ['guild_id', 'created_at']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'OnboardingRequest',
				foreignKey: {
					name: 'OnboardingRequest_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			pendingIndex
		];
	}
}

MigrationCLI.run(import.meta.url, M);
