import type { Database } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most role rules a guild has.
 */
export const MaximumRoleRules = 10;

/**
 * A role that is kept in sync with the other roles of a member: given when the member has every role of
 * `requiredRoles`, at least one of `anyRoles` (when it has some) and none of `forbiddenRoles`, taken otherwise.
 */
export interface RoleRule {
	roleId: Snowflake;
	requiredRoles: Snowflake[];
	anyRoles: Snowflake[];
	forbiddenRoles: Snowflake[];
}

const toIds = (values: readonly bigint[]) => values.map((value) => String(value));
const toBigInts = (values: readonly Snowflake[]) => values.map((value) => BigInt(value));

/**
 * Reads the role rules of a guild.
 * @param db The database to read through.
 * @param guildId The guild's ID.
 */
export async function fetchRoleRules(db: Database, guildId: Snowflake): Promise<RoleRule[]> {
	const rows = await db.orm.public.GuildRoleRule.where({ guildId: BigInt(guildId) }).all();
	return rows
		.sort((a, b) => (a.id < b.id ? -1 : 1))
		.map((row) => ({
			roleId: String(row.roleId),
			requiredRoles: toIds(row.requiredRoles),
			anyRoles: toIds(row.anyRoles),
			forbiddenRoles: toIds(row.forbiddenRoles)
		}));
}

/**
 * Sets the rule of a role, replacing the one it had, and creates the `Guild` row it references when the guild has none
 * yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param rule The rule.
 * @param language The language a `Guild` row is created with.
 * @returns Whether it was new.
 */
export async function setRoleRule(db: Database, guildId: Snowflake, rule: RoleRule, language = 'en-US'): Promise<boolean> {
	const id = BigInt(guildId);
	const roleId = BigInt(rule.roleId);
	const columns = {
		requiredRoles: toBigInts(rule.requiredRoles),
		anyRoles: toBigInts(rule.anyRoles),
		forbiddenRoles: toBigInts(rule.forbiddenRoles)
	};

	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const rules = tx.orm.public.GuildRoleRule;
		const count = await rules.where({ guildId: id, roleId }).updateAndCount(columns);
		if (Number(count) > 0) return false;

		await rules.create({ guildId: id, roleId, ...columns });
		return true;
	});
}

/**
 * Removes the rule of a role.
 * @returns Whether the guild had it.
 */
export async function deleteRoleRule(db: Database, guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.GuildRoleRule.where({ guildId: BigInt(guildId), roleId: BigInt(roleId) }).deleteAndCount();
	return Number(count) > 0;
}
