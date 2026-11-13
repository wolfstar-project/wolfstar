import { AuditLogManager, readSettingsAuditLog } from '#lib/database';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

function createSettings(id: string): ReadonlyGuildData {
	return Object.assign(Object.create(null), getDefaultGuildSettings(), { id }) as ReadonlyGuildData;
}

describe('readSettingsAuditLog', () => {
	test('GIVEN settings snapshots THEN returns distinct managers bound to each snapshot', () => {
		const initial = createSettings('123456789');
		const snapshot = createSettings('987654321');

		const initialManager = readSettingsAuditLog(initial);
		const snapshotManager = readSettingsAuditLog(snapshot);

		expect(initialManager).toBeInstanceOf(AuditLogManager);
		expect(snapshotManager).toBeInstanceOf(AuditLogManager);
		expect(snapshotManager).not.toBe(initialManager);
	});
});
