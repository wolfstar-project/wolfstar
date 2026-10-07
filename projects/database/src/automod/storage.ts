import type { Database, Models } from '../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import { normalizeAutoModerationRuleOptions, type AutoModerationRule, type AutoModerationRuleData } from './types.js';

type Orm = Database['orm'];
type Row = Models.public_GuildAutoModerationRule;

function toRule(row: Pick<Row, keyof AutoModerationRuleData | 'id' | 'guildId'>) {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		name: row.name,
		type: row.type,
		enabled: row.enabled,
		softAction: row.softAction,
		hardAction: row.hardAction,
		hardActionDuration: row.hardActionDuration,
		thresholdMaximum: row.thresholdMaximum,
		thresholdDuration: row.thresholdDuration,
		ignoredRoles: row.ignoredRoles.map(String),
		ignoredChannels: row.ignoredChannels.map(String),
		options: normalizeAutoModerationRuleOptions(row.type, row.options)
	} satisfies AutoModerationRule;
}

function toColumns(data: Partial<AutoModerationRuleData>) {
	const { ignoredRoles, ignoredChannels, ...rest } = data;
	return {
		...rest,
		...(ignoredRoles === undefined ? {} : { ignoredRoles: ignoredRoles.map((id) => BigInt(id)) }),
		...(ignoredChannels === undefined ? {} : { ignoredChannels: ignoredChannels.map((id) => BigInt(id)) })
	};
}

/**
 * Reads the auto-moderation rules of a guild, oldest first.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 * @param guildId The guild's ID.
 */
export async function fetchAutoModerationRules(orm: Orm, guildId: Snowflake): Promise<AutoModerationRule[]> {
	const rows = await orm.public.GuildAutoModerationRule.where({ guildId: BigInt(guildId) }).all();
	return rows.map((row) => toRule(row)).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * Creates a rule, and the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The rule to create.
 * @param language The language a `Guild` row is created with.
 */
export async function createAutoModerationRule(
	db: Database,
	guildId: Snowflake,
	data: AutoModerationRuleData,
	language = 'en-US'
): Promise<AutoModerationRule> {
	const id = BigInt(guildId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const row = await tx.orm.public.GuildAutoModerationRule.create({
			...data,
			guildId: id,
			ignoredRoles: data.ignoredRoles.map((role) => BigInt(role)),
			ignoredChannels: data.ignoredChannels.map((channel) => BigInt(channel))
		});
		return toRule(row);
	});
}

/**
 * Edits a rule of a guild.
 * @param db The database to write through.
 * @param guildId The guild's ID, so a rule of another guild is never edited.
 * @param ruleId The rule's ID.
 * @param data What changes.
 * @returns Whether the rule existed.
 */
export async function updateAutoModerationRule(
	db: Database,
	guildId: Snowflake,
	ruleId: string,
	data: Partial<AutoModerationRuleData>
): Promise<boolean> {
	const count = await db.orm.public.GuildAutoModerationRule.where({ id: BigInt(ruleId), guildId: BigInt(guildId) }).updateAndCount(toColumns(data));
	return Number(count) > 0;
}

/**
 * Deletes a rule of a guild.
 * @returns Whether the rule existed.
 */
export async function deleteAutoModerationRule(db: Database, guildId: Snowflake, ruleId: string): Promise<boolean> {
	const count = await db.orm.public.GuildAutoModerationRule.where({ id: BigInt(ruleId), guildId: BigInt(guildId) }).deleteAndCount();
	return Number(count) > 0;
}
