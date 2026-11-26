#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/72302aa1902feb1df8535fe7a90d2ef07e9a6a979940db5415ca1073f7ebe88d/contract';
import startContract from '../../snapshots/72302aa1902feb1df8535fe7a90d2ef07e9a6a979940db5415ca1073f7ebe88d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/980f5019a421514b9b713739be153f8bf60a883b77e35c2ffc8f26e013572c7d/contract';
import endContract from '../../snapshots/980f5019a421514b9b713739be153f8bf60a883b77e35c2ffc8f26e013572c7d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Creates an index PSL cannot say: a unique one on an expression.
 */
function createIndex(table: string, name: string, definition: string, label: string) {
	const regclass = `"public"."${name}"`;
	return rawSql({
		id: `index.${table}.${name}`,
		label,
		summary: `Creates index "${name}" on "${table}"`,
		operationClass: 'additive',
		target: { id: 'postgres', details: { schema: 'public', objectType: 'index', name, table } },
		precheck: [
			{
				description: `ensure index "${name}" does not exist`,
				sql: 'SELECT (to_regclass($1)) IS NULL AS "result"',
				params: [regclass]
			}
		],
		execute: [{ description: `create index "${name}"`, sql: definition, params: [] }],
		postcheck: [
			{
				description: `verify index "${name}" exists`,
				sql: 'SELECT (to_regclass($1)) IS NOT NULL AS "result"',
				params: [regclass]
			}
		]
	});
}

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'OnboardingChallenge',
				members: ['Button', 'Emoji', 'Question', 'Captcha']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'OnboardingFailureAction',
				members: ['None', 'Kick', 'Timeout']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'OnboardingStageTrigger',
				members: ['Join', 'NativeOnboarding']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'OnboardingVerificationStatus',
				members: ['Waiting', 'Passed', 'Failed', 'Left']
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildOnboarding',
				columns: [
					col('channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('enabled', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('log_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('revision', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildOnboarding_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildOnboardingStage',
				columns: [
					col('answers', 'text[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/text@1', many: true }
					}),
					col('challenge', '"OnboardingChallenge"', {
						notNull: true,
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'OnboardingChallenge' } }
					}),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('enabled', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('failure_action', '"OnboardingFailureAction"', {
						notNull: true,
						default: lit('None'),
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'OnboardingFailureAction' } }
					}),
					col('failure_timeout', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('max_attempts', 'int4', {
						notNull: true,
						default: lit(3),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('question', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('role_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('time_limit', 'int4', {
						notNull: true,
						default: lit(600),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('trigger', '"OnboardingStageTrigger"', {
						notNull: true,
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'OnboardingStageTrigger' } }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildOnboardingStage_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'OnboardingVerification',
				columns: [
					col('attempts', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('resolved_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('stage_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('stage_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('status', '"OnboardingVerificationStatus"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'OnboardingVerificationStatus' }
						}
					}),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'OnboardingVerification_pkey' })]
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildOnboardingStage',
				index: 'GuildOnboardingStage_guild_id_position_idx',
				columns: ['guild_id', 'position']
			}),
			this.createIndex({
				schema: 'public',
				table: 'OnboardingVerification',
				index: 'OnboardingVerification_guild_id_created_at_idx',
				columns: ['guild_id', 'created_at']
			}),
			this.createIndex({
				schema: 'public',
				table: 'OnboardingVerification',
				index: 'OnboardingVerification_guild_id_user_id_idx',
				columns: ['guild_id', 'user_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'OnboardingVerification',
				index: 'OnboardingVerification_stage_id_idx',
				columns: ['stage_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildOnboarding',
				foreignKey: {
					name: 'GuildOnboarding_id_fkey',
					columns: ['id'],
					references: { schema: 'public', table: 'Modules', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildOnboardingStage',
				foreignKey: {
					name: 'GuildOnboardingStage_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'OnboardingVerification',
				foreignKey: {
					name: 'OnboardingVerification_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'OnboardingVerification',
				foreignKey: {
					name: 'OnboardingVerification_stage_id_fkey',
					columns: ['stage_id'],
					references: { schema: 'public', table: 'GuildOnboardingStage', columns: ['id'] },
					onDelete: 'setNull',
					onUpdate: 'cascade'
				}
			}),
			// The names of the stages of a guild are unique whatever their case, as the ones of the join guard's rules:
			createIndex(
				'GuildOnboardingStage',
				'GuildOnboardingStage_guild_id_name_key',
				'CREATE UNIQUE INDEX "GuildOnboardingStage_guild_id_name_key" ON "public"."GuildOnboardingStage" ("guild_id", lower("name"))',
				'Create the unique index on the lowercase name of a stage'
			)
		];
	}
}

MigrationCLI.run(import.meta.url, M);
