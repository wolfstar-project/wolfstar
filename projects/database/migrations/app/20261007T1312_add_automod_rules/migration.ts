#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c8f64700c979c63af005d3d6e657065eeb92dedb3af0c372fe04d05040a37f41/contract';
import endContract from '../../snapshots/c8f64700c979c63af005d3d6e657065eeb92dedb3af0c372fe04d05040a37f41/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ee006af9ea392127ccb6872e47e407f7ca7c78848860ac799057936e72cbfd87/contract';
import startContract from '../../snapshots/ee006af9ea392127ccb6872e47e407f7ca7c78848860ac799057936e72cbfd87/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				members: ['Attachments', 'Capitals', 'Invites', 'Links', 'Newlines', 'NoMentionSpam', 'Words', 'Zalgo']
			}),
			this.createTable({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				columns: [
					col('enabled', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('hard_action', '"GuildAutoModerationHardAction"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'GuildAutoModerationHardAction' }
						}
					}),
					col('hard_action_duration', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
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
					col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('options', '"jsonb"', {
						notNull: true,
						default: fn("'{}'::jsonb"),
						codecRef: {
							codecId: 'typed/json@1',
							typeParams: { tsType: 'PrismaJson.AutoModerationRuleOptions' }
						}
					}),
					col('soft_action', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('threshold_duration', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('threshold_maximum', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
					col('type', '"GuildAutoModerationRuleType"', {
						notNull: true,
						codecRef: {
							codecId: 'pg/enum@1',
							typeParams: { typeName: 'GuildAutoModerationRuleType' }
						}
					})
				],
				constraints: [primaryKey(['id'], { name: 'GuildAutoModerationRule_pkey' })]
			}),
			this.createIndex({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				index: 'GuildAutoModerationRule_guild_id_idx',
				columns: ['guild_id']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				foreignKey: {
					name: 'GuildAutoModerationRule_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			// The rules a guild had are the rows the old tables hold. A configuration that is switched off but was customised (an
			// action, exemptions or a list) becomes a disabled rule, and one that was never used is not carried over. The
			// Mentions rule had no listener, so it has no rule. The old tables are dropped by the next migration, once the deploy
			// is verified: until then a rollback of the bot still finds them.
			rawSql({
				id: 'data.GuildAutoModerationRule.copy',
				label: 'Copy the enabled or customised auto-moderation configurations into GuildAutoModerationRule',
				summary: 'Creates one rule per enabled or customised configuration of the old tables',
				operationClass: 'data',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildAutoModerationRule' } },
				precheck: [
					{
						description: 'ensure GuildAutoModerationRule is empty, so the copy is not made twice',
						sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."GuildAutoModerationRule") AS "result"',
						params: []
					}
				],
				execute: [
					{
						description: 'copy the enabled or customised configurations',
						sql: `INSERT INTO "GuildAutoModerationRule" (guild_id, name, type, enabled, soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, options)
SELECT id, 'Attachments', 'Attachments'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, '{}'::jsonb
FROM "GuildAutoModerationAttachments" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0
UNION ALL
SELECT id, 'Capitals', 'Capitals'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, jsonb_build_object('minimum', minimum, 'maximum', maximum)
FROM "GuildAutoModerationCapitals" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0
UNION ALL
SELECT id, 'Invites', 'Invites'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels,
  jsonb_build_object('allowedCodes', to_jsonb(allowed_codes), 'allowedGuilds', (SELECT coalesce(jsonb_agg(guild::text), '[]'::jsonb) FROM unnest(allowed_guilds) AS guild))
FROM "GuildAutoModerationInvites" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0 OR cardinality(allowed_codes) > 0 OR cardinality(allowed_guilds) > 0
UNION ALL
SELECT id, 'Links', 'Links'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, jsonb_build_object('allowed', to_jsonb(allowed))
FROM "GuildAutoModerationLinks" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0 OR cardinality(allowed) > 0
UNION ALL
SELECT id, 'New lines', 'Newlines'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, jsonb_build_object('maximum', maximum)
FROM "GuildAutoModerationNewlines" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0
UNION ALL
SELECT id, 'Mention spam', 'NoMentionSpam'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels,
  jsonb_build_object('alerts', alerts, 'mentionsAllowed', mentions_allowed, 'timePeriod', time_period)
FROM "GuildAutoModerationNoMentionSpam" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0
UNION ALL
SELECT id, 'Words', 'Words'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, jsonb_build_object('words', to_jsonb(words))
FROM "GuildAutoModerationWords" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0 OR cardinality(words) > 0
UNION ALL
SELECT id, 'Zalgo text', 'Zalgo'::"GuildAutoModerationRuleType", coalesce(enabled, false), soft_action, hard_action, hard_action_duration, threshold_maximum, threshold_duration, ignored_roles, ignored_channels, jsonb_build_object('maximum', maximum)
FROM "GuildAutoModerationZalgo" WHERE enabled OR soft_action <> 0 OR cardinality(ignored_roles) > 0 OR cardinality(ignored_channels) > 0`,
						params: []
					}
				],
				postcheck: []
			}),
			// The names of the rules of a guild are unique, whatever the case. The contract cannot say it, since the index is on an expression.
			rawSql({
				id: 'index.GuildAutoModerationRule.GuildAutoModerationRule_guild_id_name_key',
				label: 'Create the unique index on the lowercase name of a rule',
				summary: 'Creates index "GuildAutoModerationRule_guild_id_name_key"',
				operationClass: 'additive',
				target: {
					id: 'postgres',
					details: {
						schema: 'public',
						objectType: 'index',
						name: 'GuildAutoModerationRule_guild_id_name_key',
						table: 'GuildAutoModerationRule'
					}
				},
				precheck: [
					{
						description: 'ensure index "GuildAutoModerationRule_guild_id_name_key" does not exist',
						sql: 'SELECT (to_regclass($1)) IS NULL AS "result"',
						params: ['"public"."GuildAutoModerationRule_guild_id_name_key"']
					}
				],
				execute: [
					{
						description: 'create the unique index',
						sql: 'CREATE UNIQUE INDEX "GuildAutoModerationRule_guild_id_name_key" ON "public"."GuildAutoModerationRule" ("guild_id", lower("name"))',
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify index "GuildAutoModerationRule_guild_id_name_key" exists',
						sql: 'SELECT (to_regclass($1)) IS NOT NULL AS "result"',
						params: ['"public"."GuildAutoModerationRule_guild_id_name_key"']
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
