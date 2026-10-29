import type { Snowflake } from 'discord-api-types/v10';
import type { PermissionsNode } from './types.js';

/**
 * What a dashboard access rule does: `allow` lets a member manage the server without `Manage Server`, `deny` keeps them
 * out even when they are an administrator.
 */
export type DashboardAccess = 'allow' | 'deny';

/**
 * A dashboard access rule. It lives in the columns of the legacy permission nodes, `permissions.users` and
 * `permissions.roles`, and keeps two empty `allow` and `deny` lists, so code that reads every entry as a node finds no
 * command in it.
 */
export interface DashboardAccessEntry extends PermissionsNode {
	allow: readonly [];
	deny: readonly [];
	dashboard: DashboardAccess;
}

/**
 * Whether an entry of `permissions.users` or `permissions.roles` is a dashboard access rule and not a legacy node.
 */
export function isDashboardAccessEntry(entry: PermissionsNode): entry is DashboardAccessEntry {
	return entry.dashboard === 'allow' || entry.dashboard === 'deny';
}

/**
 * Creates the dashboard access rule of a member or a role.
 */
export function createDashboardAccessEntry(id: Snowflake, dashboard: DashboardAccess): DashboardAccessEntry {
	return { id, allow: [], deny: [], dashboard };
}

/**
 * Who the access is resolved for: a member, and the roles they hold.
 */
export interface DashboardAccessSubject {
	userId: Snowflake;
	roleIds: readonly Snowflake[];
}

/**
 * The two columns the rules are read from.
 */
export interface DashboardAccessEntries {
	users: readonly PermissionsNode[];
	roles: readonly PermissionsNode[];
}

/**
 * A role of the guild and its position, which decides which rule of a member's roles wins.
 */
export interface DashboardAccessRole {
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
export function resolveDashboardAccess(
	subject: DashboardAccessSubject,
	entries: DashboardAccessEntries,
	guildRoles: readonly DashboardAccessRole[]
): DashboardAccess | null {
	const own = entries.users.find((entry): entry is DashboardAccessEntry => isDashboardAccessEntry(entry) && entry.id === subject.userId);
	if (own !== undefined) return own.dashboard;

	const ruled = new Map<string, DashboardAccess>();
	for (const entry of entries.roles) {
		if (isDashboardAccessEntry(entry)) ruled.set(entry.id, entry.dashboard);
	}
	if (ruled.size === 0) return null;

	const held = new Set(subject.roleIds);
	let highest: DashboardAccessRole | null = null;
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
export function hasDashboardAccessEntries(entries: readonly PermissionsNode[]): boolean {
	return entries.some(isDashboardAccessEntry);
}
