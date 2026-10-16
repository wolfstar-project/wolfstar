import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { deleteRoleRule, fetchRoleRules, MaximumRoleRules, setRoleRule, type RoleRule } from 'wolfstar-database';

/**
 * The role rules of each guild, which every change of the roles of a member is checked against.
 */
const cache = new Collection<Snowflake, readonly RoleRule[]>();

/**
 * Why a rule cannot be added: the guild has the most it can have, or the rule would make the rules feed each other.
 */
export class RoleRuleError extends Error {
	public constructor(
		public readonly reason: 'limit' | 'self' | 'chained',
		public readonly roleId: Snowflake | null = null
	) {
		super(`Role rule refused: ${reason}`);
	}
}

/**
 * Reads the role rules of a guild, from the cache after the first time.
 */
export async function readRoleRules(guildId: Snowflake): Promise<readonly RoleRule[]> {
	const cached = cache.get(guildId);
	if (cached) return cached;

	const rules = await fetchRoleRules(container.prisma, guildId);
	cache.set(guildId, rules);
	return rules;
}

// The rules are cached by every shard process, so a change in one of them makes the copies of the others stale.
onShardMessage('roleRulesUpdate', ({ guildId }) => cache.delete(guildId));

function changed(guildId: Snowflake) {
	cache.delete(guildId);
	broadcastShardMessage({ type: 'roleRulesUpdate', guildId });
}

/**
 * The roles a rule reads to decide.
 */
export function getRoleRuleConditions(rule: RoleRule): Snowflake[] {
	return [...rule.requiredRoles, ...rule.anyRoles, ...rule.forbiddenRoles];
}

/**
 * Checks that a rule can stand next to the others: it does not read its own role, and no rule reads the role another
 * one gives, since two rules that give and take each other's role would never settle (`A` without `B`, `B` without
 * `A`).
 *
 * @param rules - The rules of the guild, the one of the same role is replaced.
 * @param rule - The rule to add.
 * @throws {@linkcode RoleRuleError} When it cannot.
 */
export function checkRoleRule(rules: readonly RoleRule[], rule: RoleRule): void {
	const conditions = getRoleRuleConditions(rule);
	if (conditions.includes(rule.roleId)) throw new RoleRuleError('self', rule.roleId);

	const others = rules.filter((entry) => entry.roleId !== rule.roleId);
	const chained = conditions.find((roleId) => others.some((entry) => entry.roleId === roleId));
	if (chained !== undefined) throw new RoleRuleError('chained', chained);

	const reader = others.find((entry) => getRoleRuleConditions(entry).includes(rule.roleId));
	if (reader !== undefined) throw new RoleRuleError('chained', reader.roleId);
}

/**
 * Whether a member with these roles meets a rule.
 *
 * @param rule - The rule.
 * @param roleIds - The roles of the member.
 */
export function matchesRoleRule(rule: RoleRule, roleIds: ReadonlySet<Snowflake>): boolean {
	if (!rule.requiredRoles.every((roleId) => roleIds.has(roleId))) return false;
	if (rule.anyRoles.length > 0 && !rule.anyRoles.some((roleId) => roleIds.has(roleId))) return false;
	return !rule.forbiddenRoles.some((roleId) => roleIds.has(roleId));
}

/**
 * What the rules change for a member: the roles to give, of the rules they meet, and the ones to take, of the rules
 * they no longer meet.
 *
 * @param rules - The rules of the guild.
 * @param roleIds - The roles of the member.
 */
export function getRoleRuleChanges(rules: readonly RoleRule[], roleIds: ReadonlySet<Snowflake>) {
	const add: Snowflake[] = [];
	const remove: Snowflake[] = [];
	for (const rule of rules) {
		const meets = matchesRoleRule(rule, roleIds);
		const has = roleIds.has(rule.roleId);
		if (meets && !has) add.push(rule.roleId);
		else if (!meets && has) remove.push(rule.roleId);
	}

	return { add, remove };
}

/**
 * Sets the rule of a role, which replaces the one it had.
 *
 * @returns Whether it was new.
 * @throws {@linkcode RoleRuleError} When the guild has the most rules it can have, or the rule would feed another.
 */
export async function addRoleRule(guildId: Snowflake, rule: RoleRule): Promise<boolean> {
	const existing = await fetchRoleRules(container.prisma, guildId);
	if (existing.length >= MaximumRoleRules && !existing.some((entry) => entry.roleId === rule.roleId)) throw new RoleRuleError('limit');
	checkRoleRule(existing, rule);

	const created = await setRoleRule(container.prisma, guildId, rule);
	changed(guildId);
	return created;
}

/**
 * Removes the rule of a role. The members keep the role they have.
 *
 * @returns Whether the guild had it.
 */
export async function removeRoleRule(guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
	const deleted = await deleteRoleRule(container.prisma, guildId, roleId);
	if (deleted) changed(guildId);
	return deleted;
}
