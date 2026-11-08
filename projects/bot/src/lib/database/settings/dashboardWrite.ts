import { resolveAccess, type AccessRole, type PermissionsNode } from 'wolfstar-database';

type AccessSettings = {
	rolesAdmin: readonly string[];
	permissionsUsers: readonly PermissionsNode[];
	permissionsRoles: readonly PermissionsNode[];
};

type DashboardWrite = {
	ownerId: string;
	userId: string;
	guildId: string;
	roleIds: readonly string[];
	manageGuild: boolean;
	roles: readonly AccessRole[];
	current: AccessSettings;
	changes: Partial<AccessSettings>;
};

/** Checks who may change access and whether an explicit rule locks its author out. */
export function checkDashboardWrite(input: DashboardWrite): 'not-administrator' | 'outranked' | 'lockout' | null {
	const { current, changes, userId, ownerId, roles } = input;
	if (changes.rolesAdmin === undefined && changes.permissionsUsers === undefined && changes.permissionsRoles === undefined) return null;
	if (userId === ownerId) return null;
	const held = new Set([input.guildId, ...input.roleIds]);
	const administrator = current.rolesAdmin.length === 0 ? input.manageGuild : current.rolesAdmin.some((id) => held.has(id));
	if (!administrator) return 'not-administrator';
	const changed = (next: readonly PermissionsNode[] | undefined, previous: readonly PermissionsNode[]) => {
		if (next === undefined) return [];
		const before = new Map(previous.map((entry) => [entry.id, JSON.stringify(entry)]));
		const after = new Set(next.map((entry) => entry.id));
		return [...next.filter((entry) => before.get(entry.id) !== JSON.stringify(entry)), ...previous.filter((entry) => !after.has(entry.id))];
	};
	if (changed(changes.permissionsUsers, current.permissionsUsers).some((entry) => entry.id === ownerId)) return 'outranked';
	const positions = new Map(roles.map((role) => [role.id, role.position]));
	const highest = roles.reduce((top, role) => (held.has(role.id) ? Math.max(top, role.position) : top), 0);
	if (changed(changes.permissionsRoles, current.permissionsRoles).some((entry) => (positions.get(entry.id) ?? -1) >= highest)) return 'outranked';
	const access = resolveAccess(
		{ userId, roleIds: [...held] },
		{ users: changes.permissionsUsers ?? current.permissionsUsers, roles: changes.permissionsRoles ?? current.permissionsRoles },
		roles
	);
	return access === 'deny' ? 'lockout' : null;
}
