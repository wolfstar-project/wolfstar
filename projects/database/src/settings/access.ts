import type { Snowflake } from 'discord-api-types/v10';
import type { PermissionsNode } from './types.js';

/**
 * What a dashboard access rule does: `allow` lets a member manage the server without `Manage Server`, `deny` keeps them
 * out even when they are an administrator.
 */
export type Access = 'allow' | 'deny';

/**
 * A dashboard access rule. It lives in the columns of the legacy permission nodes, `permissions.users` and
 * `permissions.roles`, and keeps two empty `allow` and `deny` lists, so code that reads every entry as a node finds no
 * command in it.
 */
export interface AccessEntry extends PermissionsNode {
	allow: readonly [];
	deny: readonly [];
	dashboard: Access;
}

/**
 * Whether an entry of `permissions.users` or `permissions.roles` is a dashboard access rule and not a legacy node.
 */
export function isAccessEntry(entry: PermissionsNode): entry is AccessEntry {
	return entry.dashboard === 'allow' || entry.dashboard === 'deny';
}

/**
 * Creates the dashboard access rule of a member or a role.
 */
export function createAccessEntry(id: Snowflake, dashboard: Access): AccessEntry {
	return { id, allow: [], deny: [], dashboard };
}

/**
 * Who the access is resolved for: a member, and the roles they hold.
 */
export interface AccessSubject {
	userId: Snowflake;
	roleIds: readonly Snowflake[];
}

/**
 * The two columns the rules are read from.
 */
export interface AccessEntries {
	users: readonly PermissionsNode[];
	roles: readonly PermissionsNode[];
}

/**
 * A role of the guild and its position, which decides which rule of a member's roles wins.
 */
export interface AccessRole {
	id: Snowflake;
	position: number;
}

/**
 * The dashboard access rule that decides for a member: their own rule in `permissions.users` first, else the rule of
 * their highest role that has one in `permissions.roles`, by position, and of two roles at the same position the one
 * with the higher ID, as Discord orders them. A rule decides on its own: an `allow` lets in a member without
 * `Manage Server`, a `deny` keeps out an administrator.
 *
 * The owner of the server is not a matter of rules: whoever calls this lets them in first.
 *
 * @param subject - The member and the roles they hold.
 * @param entries - The `permissions.users` and `permissions.roles` columns. Their legacy nodes are skipped.
 * @param guildRoles - The roles of the guild with their positions. Only read when no rule names the member themselves.
 * @returns The access of the rule that decides, `null` when no rule names the member nor one of their roles: the
 * administrator check and the legacy nodes decide then.
 */
export function resolveAccess(subject: AccessSubject, entries: AccessEntries, guildRoles: readonly AccessRole[]): Access | null {
	const own = entries.users.find((entry): entry is AccessEntry => isAccessEntry(entry) && entry.id === subject.userId);
	if (own !== undefined) return own.dashboard;

	const ruled = new Map<string, Access>();
	for (const entry of entries.roles) {
		if (isAccessEntry(entry)) ruled.set(entry.id, entry.dashboard);
	}
	if (ruled.size === 0) return null;

	const held = new Set(subject.roleIds);
	let highest: AccessRole | null = null;
	for (const role of guildRoles) {
		if (!held.has(role.id) || !ruled.has(role.id)) continue;
		if (highest === null || role.position > highest.position || (role.position === highest.position && BigInt(role.id) > BigInt(highest.id))) {
			highest = role;
		}
	}

	return highest === null ? null : (ruled.get(highest.id) ?? null);
}

/**
 * Whether a column holds a dashboard access rule, so the roles of the guild are only fetched when one can decide.
 */
export function hasAccessEntries(entries: readonly PermissionsNode[]): boolean {
	return entries.some(isAccessEntry);
}
