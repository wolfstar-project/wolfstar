import type { JoinGuardSettings } from 'wolfstar-database';

/**
 * Why settings of the join guard cannot be written together, checked on what they end up as: one role cannot be the
 * pending and the verified role, every member who waits would hold the role that lets them in.
 *
 * @param settings - The settings with the change applied.
 * @returns The key of the reason, `null` when they can be written.
 */
export function findJoinGuardSettingsConflict(
	settings: Pick<JoinGuardSettings, 'joinGuardPendingRole' | 'joinGuardVerifiedRole'>
): 'serializers:joinGuardSameRoles' | null {
	const pending = settings.joinGuardPendingRole;
	return pending !== null && pending === settings.joinGuardVerifiedRole ? 'serializers:joinGuardSameRoles' : null;
}
