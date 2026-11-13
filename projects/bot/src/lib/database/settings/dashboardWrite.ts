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
		const before = new Map(previous.map((entry) => [entry.id, entry]));
		const after = new Set(next.map((entry) => entry.id));
		return [
			...next.filter((entry) => {
				const old = before.get(entry.id);
				return (
					old === undefined ||
					old.dashboard !== entry.dashboard ||
					JSON.stringify(old.allow) !== JSON.stringify(entry.allow) ||
					JSON.stringify(old.deny) !== JSON.stringify(entry.deny)
				);
			}),
			...previous.filter((entry) => !after.has(entry.id))
		];
	};
	if (changed(changes.permissionsUsers, current.permissionsUsers).some((entry) => entry.id === ownerId)) return 'outranked';
	const ranksHigher = (a: AccessRole, b: AccessRole) => a.position > b.position || (a.position === b.position && BigInt(a.id) < BigInt(b.id));
	const highest = roles.reduce<AccessRole | null>(
		(top, role) => (held.has(role.id) && (top === null || ranksHigher(role, top)) ? role : top),
		null
	);
	const rolesById = new Map(roles.map((role) => [role.id, role]));
	if (
		changed(changes.permissionsRoles, current.permissionsRoles).some((entry) => {
			const target = rolesById.get(entry.id);
			return target !== undefined && (highest === null || target.id === highest.id || ranksHigher(target, highest));
		})
	)
		return 'outranked';
	const access = resolveAccess(
		{ userId, roleIds: [...held] },
		{ users: changes.permissionsUsers ?? current.permissionsUsers, roles: changes.permissionsRoles ?? current.permissionsRoles },
		roles
	);
	if (access === 'deny') return 'lockout';
	if (access === 'allow') return null;
	const nextAdminRoles = changes.rolesAdmin ?? current.rolesAdmin;
	const retainsAdmin = nextAdminRoles.length === 0 ? input.manageGuild : nextAdminRoles.some((id) => held.has(id));
	return retainsAdmin ? null : 'lockout';
}
