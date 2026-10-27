import { createHash } from 'node:crypto';
import type { ReadonlyGuildData } from 'wolfstar-database';

export type LegacyPermissionSettings = Pick<ReadonlyGuildData, 'permissionsUsers' | 'permissionsRoles'>;

/** Keep the old policies intact: role order and wildcard exceptions cannot become flat allow/deny lists. */
export function getLegacyPermissions(settings: LegacyPermissionSettings) {
	return { users: settings.permissionsUsers, roles: settings.permissionsRoles };
}

export function hasLegacyPermissions(settings: LegacyPermissionSettings): boolean {
	return settings.permissionsUsers.length > 0 || settings.permissionsRoles.length > 0;
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
