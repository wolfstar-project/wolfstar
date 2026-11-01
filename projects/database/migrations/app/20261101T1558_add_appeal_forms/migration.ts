#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract';
import endContract from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/bd5ea1af98122288144902d4589ba48c4d7f39ed8f9d81802738d2b4549fd148/contract';
import startContract from '../../snapshots/bd5ea1af98122288144902d4589ba48c4d7f39ed8f9d81802738d2b4549fd148/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, rawSql, primaryKey } from '@prisma/orm-postgres/migration';

const target = (name: string) => ({ id: 'postgres' as const, details: { schema: 'public', objectType: 'table' as const, name } });

function pendingIndex(table: string, index: string, sql: string) {
	return rawSql({
		id: `index.${table}.${index}`,
		label: `Create the index ${index}`,
		summary: `Creates ${index} on "${table}"`,
		operationClass: 'additive',
		target: target(table),
		precheck: [],
		execute: [{ description: `create ${index}`, sql, params: [] }],
		postcheck: [
			{
				description: `verify ${index} exists`,
				sql: `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = '${index}') AS "result"`,
				params: []
			}
		]
	});
}

// The answers were a list of texts. They are kept as they were here and become objects below, once the forms exist:
const answersToJson = rawSql({
	id: 'column.Appeal.answers.jsonb',
	label: 'Keep the answers of an appeal as JSON',
	summary: 'Changes "Appeal"."answers" from text[] to jsonb',
	operationClass: 'data',
	target: target('Appeal'),
	precheck: [],
	execute: [
		{ description: 'drop the default', sql: `ALTER TABLE "public"."Appeal" ALTER COLUMN "answers" DROP DEFAULT`, params: [] },
		{
			description: 'change the type',
			sql: `ALTER TABLE "public"."Appeal" ALTER COLUMN "answers" TYPE jsonb USING to_jsonb("answers")`,
			params: []
		},
		{ description: 'set the default', sql: `ALTER TABLE "public"."Appeal" ALTER COLUMN "answers" SET DEFAULT '[]'::jsonb`, params: [] }
	],
	postcheck: [
		{
			description: 'verify the column is jsonb',
			sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Appeal' AND column_name = 'answers' AND data_type = 'jsonb') AS "result"`,
			params: []
		}
	]
});

// The questions of a guild become its first form, as the bot read them: the lines that are not blank, five at most. It
// goes in this migration because one that does not change the contract is never run.
const questionsToForms = rawSql({
	id: 'data.GuildAppeals.questions',
	label: 'Make the first form of the guilds that set questions',
	summary: 'Inserts one "AppealForm" per guild with questions',
	operationClass: 'data',
	target: target('AppealForm'),
	precheck: [],
	execute: [
		{
			description: 'insert the forms',
			sql: `WITH "lines" AS (
        SELECT "g"."id", btrim("q"."line") AS "line", row_number() OVER (PARTITION BY "g"."id" ORDER BY "q"."position") AS "number"
        FROM "public"."GuildAppeals" AS "g", unnest("g"."questions") WITH ORDINALITY AS "q"("line", "position")
        WHERE btrim("q"."line") <> ''
      )
      INSERT INTO "public"."AppealForm" ("guild_id", "name", "questions")
      SELECT "id", 'Appeal', jsonb_agg(
        jsonb_build_object('id', 'q' || "number", 'kind', 'text', 'label', left("line", 100), 'long', true, 'maxLength', 1000, 'required', true)
        ORDER BY "number"
      )
      FROM "lines" WHERE "number" <= 5 GROUP BY "id"`,
			params: []
		}
	],
	postcheck: []
});

// An answer takes the label of its question by its position, and `#n` when the guild had no questions:
const answersToObjects = rawSql({
	id: 'data.Appeal.answers',
	label: 'Turn the answers of the appeals into objects',
	summary: 'Rewrites "Appeal"."answers" as one object per answer',
	operationClass: 'data',
	target: target('Appeal'),
	precheck: [],
	execute: [
		{
			description: 'rewrite the answers',
			sql: `UPDATE "public"."Appeal" AS "a" SET
        "form_id" = "f"."id",
        "answers" = (
          SELECT jsonb_agg(
            jsonb_build_object(
              'questionId', 'q' || "e"."position", 'kind', 'text',
              'label', coalesce("f"."questions" -> ("e"."position"::int - 1) ->> 'label', '#' || "e"."position"),
              'value', "e"."answer"
            )
            ORDER BY "e"."position"
          )
          FROM jsonb_array_elements_text("a"."answers") WITH ORDINALITY AS "e"("answer", "position")
        )
      FROM (SELECT "a2"."id" AS "appeal", "f2"."id", "f2"."questions" FROM "public"."Appeal" AS "a2" LEFT JOIN "public"."AppealForm" AS "f2" ON "f2"."guild_id" = "a2"."guild_id") AS "f"
      WHERE "f"."appeal" = "a"."id" AND jsonb_array_length("a"."answers") > 0`,
			params: []
		}
	],
	postcheck: []
});

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'AppealRequestKind',
				members: ['Approve', 'Deny', 'Block', 'Unblock']
			}),
			this.createTable({
				schema: 'public',
				table: 'AppealBlock',
				columns: [
					col('automatic', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('moderator_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['guild_id', 'user_id'], { name: 'AppealBlock_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'AppealForm',
				columns: [
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('enabled', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' }
					}),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('icon', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('lock_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('position', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' }
					}),
					col('questions', '"jsonb"', {
						notNull: true,
						default: fn("'[]'::jsonb"),
						codecRef: {
							codecId: 'typed/json@1',
							typeParams: { tsType: 'PrismaJson.AppealFormQuestions' }
						}
					}),
					col('required_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('restricted_roles', 'int8[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int8@1', many: true }
					}),
					col('types', 'int4[]', {
						notNull: true,
						default: lit([]),
						codecRef: { codecId: 'pg/int4@1', many: true }
					}),
					col('updated_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					})
				],
				constraints: [primaryKey(['id'], { name: 'AppealForm_pkey' })]
			}),
			this.createTable({
				schema: 'public',
				table: 'AppealRequest',
				columns: [
					col('appeal_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
					col('created_at', 'timestamp(3)', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('kind', '"AppealRequestKind"', {
						notNull: true,
						codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'AppealRequestKind' } }
					}),
					col('moderator_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('processed_at', 'timestamp(3)', {
						codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
					}),
					col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
					col('user_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['id'], { name: 'AppealRequest_pkey' })]
			}),
			this.addColumn({
				schema: 'public',
				table: 'Appeal',
				column: col('decided_at', 'timestamp(3)', {
					codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'Appeal',
				column: col('form_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			}),
			this.addColumn({
				schema: 'public',
				table: 'Appeal',
				column: col('thread_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } })
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('anonymous', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('block_on_denial', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('cooldown_days', 'int4', {
					notNull: true,
					default: lit(7),
					codecRef: { codecId: 'pg/int4@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('manager_roles', 'int8[]', {
					notNull: true,
					default: lit([]),
					codecRef: { codecId: 'pg/int8@1', many: true }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('max_active', 'int4', {
					notNull: true,
					default: lit(1),
					codecRef: { codecId: 'pg/int4@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('ping_roles', 'int8[]', {
					notNull: true,
					default: lit([]),
					codecRef: { codecId: 'pg/int8@1', many: true }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAppeals',
				column: col('thread', 'text', {
					notNull: true,
					default: lit('public'),
					codecRef: { codecId: 'pg/text@1' }
				})
			}),
			answersToJson,
			this.createIndex({
				schema: 'public',
				table: 'AppealForm',
				index: 'AppealForm_guild_id_position_idx',
				columns: ['guild_id', 'position']
			}),
			this.createIndex({
				schema: 'public',
				table: 'AppealRequest',
				index: 'AppealRequest_guild_id_created_at_idx',
				columns: ['guild_id', 'created_at']
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'AppealBlock',
				foreignKey: {
					name: 'AppealBlock_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'AppealForm',
				foreignKey: {
					name: 'AppealForm_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'AppealRequest',
				foreignKey: {
					name: 'AppealRequest_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			}),
			// The names of the forms of a guild are unique whatever their case, as the rules of the join guard:
			pendingIndex(
				'AppealForm',
				'AppealForm_guild_id_name_key',
				'CREATE UNIQUE INDEX "AppealForm_guild_id_name_key" ON "public"."AppealForm" ("guild_id", lower("name"))'
			),
			// The requests the bot did not handle yet, which it sweeps in case a notification was lost:
			pendingIndex(
				'AppealRequest',
				'AppealRequest_created_at_pending_idx',
				'CREATE INDEX "AppealRequest_created_at_pending_idx" ON "public"."AppealRequest" ("created_at") WHERE "processed_at" IS NULL'
			),
			questionsToForms,
			answersToObjects
		];
	}
}

MigrationCLI.run(import.meta.url, M);
