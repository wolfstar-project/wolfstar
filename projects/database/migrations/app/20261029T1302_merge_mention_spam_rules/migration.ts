#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/aa0cf7a141e97e7204f31bba847cb2557c605de148d1a2a7994e5a6918872850/contract';
import startContract from '../../snapshots/aa0cf7a141e97e7204f31bba847cb2557c605de148d1a2a7994e5a6918872850/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7/contract';
import endContract from '../../snapshots/f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			// A mention spam rule banned by itself and left the response of the rule aside. It is a mentions cooldown rule
			// that weighs the mentions now, so the rules there are become one, with what they did kept: a ban at the first
			// infraction, and the message in the channel the ban was told with.
			rawSql({
				id: 'data.GuildAutoModerationRule.mergeMentionSpam',
				label: 'Turn the mention spam rules into mentions cooldown rules',
				summary: 'Rewrites the rules of type "NoMentionSpam" as "MentionsCooldown" rules that weigh the mentions and ban',
				operationClass: 'destructive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'GuildAutoModerationRule' } },
				precheck: [],
				execute: [
					{
						description: 'rewrite the mention spam rules',
						sql: `UPDATE "public"."GuildAutoModerationRule"
SET "type" = 'MentionsCooldown',
  "options" = jsonb_build_object(
    'maximum', CASE WHEN jsonb_typeof("options"->'mentionsAllowed') = 'number' THEN LEAST(200, GREATEST(1, trunc(("options"->>'mentionsAllowed')::numeric)::int)) ELSE 20 END,
    'timePeriod', CASE WHEN jsonb_typeof("options"->'timePeriod') = 'number' THEN LEAST(3600, GREATEST(1, trunc(("options"->>'timePeriod')::numeric)::int)) ELSE 8 END,
    'weighted', true
  ),
  "soft_action" = "soft_action" | 4,
  "hard_action" = 'Ban',
  "hard_action_duration" = NULL,
  "threshold_maximum" = 0,
  "escalation" = '[]'::jsonb
WHERE "type"::text = 'NoMentionSpam'`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify no rule is a mention spam rule',
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."GuildAutoModerationRule" WHERE "type"::text = 'NoMentionSpam') AS "result"`,
						params: []
					}
				]
			}),
			// A native enum cannot lose a value, so it is made again without it:
			rawSql({
				id: 'enum.GuildAutoModerationRuleType.dropNoMentionSpam',
				label: 'Remove "NoMentionSpam" from the types of the rules',
				summary: 'Makes "GuildAutoModerationRuleType" again without "NoMentionSpam"',
				operationClass: 'destructive',
				target: { id: 'postgres', details: { schema: 'public', objectType: 'type', name: 'GuildAutoModerationRuleType' } },
				precheck: [
					{
						description: 'ensure no rule is a mention spam rule',
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."GuildAutoModerationRule" WHERE "type"::text = 'NoMentionSpam') AS "result"`,
						params: []
					}
				],
				execute: [
					{
						description: 'rename the type that has the value',
						sql: `ALTER TYPE "public"."GuildAutoModerationRuleType" RENAME TO "GuildAutoModerationRuleType_old"`,
						params: []
					},
					{
						description: 'create the type without it',
						sql: `CREATE TYPE "public"."GuildAutoModerationRuleType" AS ENUM ('Attachments', 'Capitals', 'Invites', 'Links', 'Newlines', 'Words', 'Zalgo', 'Phishing', 'Stickers', 'Duplicates', 'Characters', 'Emojis', 'MessageSpam', 'ImageSpam', 'LinksCooldown', 'MassMentions', 'MentionsCooldown', 'Spoilers', 'MaskedLinks', 'StickersCooldown', 'Polls')`,
						params: []
					},
					{
						description: 'move the column to the new type',
						sql: `ALTER TABLE "public"."GuildAutoModerationRule" ALTER COLUMN "type" TYPE "public"."GuildAutoModerationRuleType" USING "type"::text::"public"."GuildAutoModerationRuleType"`,
						params: []
					},
					{
						description: 'drop the old type',
						sql: `DROP TYPE "public"."GuildAutoModerationRuleType_old"`,
						params: []
					}
				],
				postcheck: [
					{
						description: 'verify the type has no "NoMentionSpam"',
						sql: `SELECT NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'GuildAutoModerationRuleType' AND e.enumlabel = 'NoMentionSpam') AS "result"`,
						params: []
					}
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
