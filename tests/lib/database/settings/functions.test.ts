import { AuditLogManager, readSettingsAuditLog } from '#lib/database';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import type { ReadonlyGuildData } from '#lib/database/settings/types';

describe('readSettingsAuditLog', () => {
	test('GIVEN settings snapshots THEN returns distinct managers bound to each snapshot', () => {
		const initial = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: '123456789' }) as ReadonlyGuildData;
		const snapshot = Object.assign(Object.create(null), structuredClone(initial), { id: '987654321' }) as ReadonlyGuildData;

		const initialManager = readSettingsAuditLog(initial);
		const snapshotManager = readSettingsAuditLog(snapshot);

		expect(initialManager).toBeInstanceOf(AuditLogManager);
		expect(snapshotManager).toBeInstanceOf(AuditLogManager);
		expect(snapshotManager).not.toBe(initialManager);
	});
});
