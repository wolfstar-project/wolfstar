#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2e58ed3ca4db8fcf9c666b01bf4c6b7c9d95a91ebd426ba0d4e2700ad0a05b68/contract';
import startContract from '../../snapshots/2e58ed3ca4db8fcf9c666b01bf4c6b7c9d95a91ebd426ba0d4e2700ad0a05b68/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/aa0cf7a141e97e7204f31bba847cb2557c605de148d1a2a7994e5a6918872850/contract';
import endContract from '../../snapshots/aa0cf7a141e97e7204f31bba847cb2557c605de148d1a2a7994e5a6918872850/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Creates an index PSL cannot say: a unique one on an expression, or a partial one.
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
				typeName: 'JoinGuardCheckpointStatus',
				members: ['Waiting', 'Verified', 'Kicked', 'Banned', 'Left']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'JoinGuardHardAction',
				members: ['Kick', 'Ban']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'JoinGuardRequestKind',
				members: ['Pass', 'Verify', 'Kick', 'PostButton']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'JoinGuardResolution',
				members: ['Rule', 'Checkpoint', 'Timeout', 'Moderator']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'JoinGuardSharedBanSource',
				members: ['JoinGuard', 'Honeypot']
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildJoinGuard',
				columns: [
					col('allowed_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('allowed_users', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('captcha', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('checkpoint', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('checkpoint_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('checkpoint_message_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('checkpoint_timeout', 'int4', {
						notNull: true,
						default: lit(86400),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('connections', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('direct_message', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('direct_message_content', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('enabled', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('log_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('minimum_trust', 'int4', {
						notNull: true,
						default: lit(1),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('pending_role_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('shared_bans', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('verified_role_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'GuildJoinGuard_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildJoinGuardRule',
				columns: [
					col('account_age_max', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('alert_channel_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('default_avatar', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('direct_message', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('enabled', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('generated_name', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('hard_action', '"JoinGuardHardAction"', {
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'JoinGuardHardAction' } }
					}),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('name_contains', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('role_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('send_to_checkpoint', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('unverified_bot', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildJoinGuardRule_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'JoinGuardCheckpoint',
				columns: [
					col('account_created_at', 'timestamp(3)', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('case_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('default_avatar', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
					col('expires_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('generated_name', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('linked_accounts', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('moderator_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('resolution', '"JoinGuardResolution"', {
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'JoinGuardResolution' } }
					}),
					col('resolved_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('rule_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('rule_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('status', '"JoinGuardCheckpointStatus"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'JoinGuardCheckpointStatus' }
						}
					}),
					col('trust', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'JoinGuardCheckpoint_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'JoinGuardRequest',
				columns: [
					col('checkpoint_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('kind', '"JoinGuardRequestKind"', {
						notNull: true,
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'JoinGuardRequestKind' } }
					}),
					col('linked_accounts', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('moderator_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('processed_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('trust', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'JoinGuardRequest_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'JoinGuardSharedBan',
				columns: [
					col('case_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('source', '"JoinGuardSharedBanSource"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'JoinGuardSharedBanSource' }
						}
					}),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['guild_id', 'case_id'], { name: 'JoinGuardSharedBan_pkey' })]
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildJoinGuardRule',
				index: 'GuildJoinGuardRule_guild_id_idx',
				columns: ['guild_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'JoinGuardCheckpoint',
				index: 'JoinGuardCheckpoint_guild_id_status_created_at_idx',
				columns: ['guild_id', 'status', 'created_at']
			}),
			this.createIndex({
				schema: 'public',
				table: 'JoinGuardCheckpoint',
				index: 'JoinGuardCheckpoint_guild_id_user_id_idx',
				columns: ['guild_id', 'user_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'JoinGuardCheckpoint',
				index: 'JoinGuardCheckpoint_rule_id_idx',
				columns: ['rule_id']
			}),
			this.createIndex({
				schema: 'public',
				table: 'JoinGuardRequest',
				index: 'JoinGuardRequest_guild_id_created_at_idx',
				columns: ['guild_id', 'created_at']
			}),
			this.createIndex({
				schema: 'public',
				table: 'JoinGuardSharedBan',
				index: 'JoinGuardSharedBan_user_id_idx',
				columns: ['user_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildJoinGuard',
				foreignKey: {
					name: 'GuildJoinGuard_id_fkey',
					columns: ['id'],
					references: { schema: 'public', table: 'Modules', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildJoinGuardRule',
				foreignKey: {
					name: 'GuildJoinGuardRule_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'JoinGuardCheckpoint',
				foreignKey: {
					name: 'JoinGuardCheckpoint_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'JoinGuardCheckpoint',
				foreignKey: {
					name: 'JoinGuardCheckpoint_rule_id_fkey',
					columns: ['rule_id'],
					references: { schema: 'public', table: 'GuildJoinGuardRule', columns: ['id'] },
					onDelete: 'setNull',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'JoinGuardRequest',
				foreignKey: {
					name: 'JoinGuardRequest_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			// The names of the rules of a guild are unique whatever their case, as the ones of the auto-moderation rules:
			createIndex(
				'GuildJoinGuardRule',
				'GuildJoinGuardRule_guild_id_name_key',
				'CREATE UNIQUE INDEX "GuildJoinGuardRule_guild_id_name_key" ON "public"."GuildJoinGuardRule" ("guild_id", lower("name"))',
				'Create the unique index on the lowercase name of a rule'
			),
			// A member waits at the checkpoint of a guild once at most, whatever the bot and the website do at the same time:
			createIndex(
				'JoinGuardCheckpoint',
				'JoinGuardCheckpoint_guild_id_user_id_waiting_key',
				'CREATE UNIQUE INDEX "JoinGuardCheckpoint_guild_id_user_id_waiting_key" ON "public"."JoinGuardCheckpoint" ("guild_id", "user_id") WHERE "status" = \'Waiting\'',
				'Create the partial unique index on the waiting member of a guild'
			),
			// The requests the bot did not handle yet, which it sweeps every 30 seconds in case a notification was lost:
			createIndex(
				'JoinGuardRequest',
				'JoinGuardRequest_created_at_pending_idx',
				'CREATE INDEX "JoinGuardRequest_created_at_pending_idx" ON "public"."JoinGuardRequest" ("created_at") WHERE "processed_at" IS NULL',
				'Create the partial index on the requests that are not handled yet'
			)
		];
	}
}

MigrationCLI.run(import.meta.url, M);
