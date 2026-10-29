import { createHash } from 'node:crypto';
import { isDashboardAccessEntry, type PermissionsNode, type ReadonlyGuildData } from 'wolfstar-database';

export type LegacyPermissionSettings = Pick<ReadonlyGuildData, 'permissionsUsers' | 'permissionsRoles'>;

/** The legacy nodes of a column, without the dashboard access rules of wolfstar.rocks that share it. */
function legacyNodes(entries: readonly PermissionsNode[]): readonly PermissionsNode[] {
	return entries.filter((entry) => !isDashboardAccessEntry(entry));
}

/** The dashboard access rules of a column, which removing the legacy nodes keeps. */
export function keepDashboardAccessEntries(entries: readonly PermissionsNode[]): PermissionsNode[] {
	return entries.filter((entry) => isDashboardAccessEntry(entry));
}

/** Keep the old policies intact: role order and wildcard exceptions cannot become flat allow/deny lists. */
export function getLegacyPermissions(settings: LegacyPermissionSettings) {
	return { users: legacyNodes(settings.permissionsUsers), roles: legacyNodes(settings.permissionsRoles) };
}

export function hasLegacyPermissions(settings: LegacyPermissionSettings): boolean {
	const { users, roles } = getLegacyPermissions(settings);
	return users.length > 0 || roles.length > 0;
}

export function getLegacyPermissionRevision(settings: LegacyPermissionSettings): number {
	return Number.parseInt(
		createHash('sha256')
			.update(JSON.stringify(getLegacyPermissions(settings)))
			.digest('hex')
			.slice(0, 8),
		16
	);
}
