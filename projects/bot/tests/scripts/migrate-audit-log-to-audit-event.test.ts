import { hashEnvelope } from '#lib/database/settings/structures/AuditLogEnvelope';

function mapAction(action: string): string {
	switch (action) {
		case 'settings.update':
			return 'guild.settings.update';
		case 'settings.add':
			return 'guild.settings.add';
		case 'settings.remove':
			return 'guild.settings.remove';
		default:
			return 'guild.settings.update';
	}
}

function transformChanges(changes: Array<{ key: string; oldValue?: unknown; newValue?: unknown }>) {
	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};

	for (const change of changes) {
		if (change.oldValue !== undefined) before[change.key] = change.oldValue;
		if (change.newValue !== undefined) after[change.key] = change.newValue;
	}

	return { before, after };
}

describe('legacy audit_log migration mapping', () => {
	it('maps settings.update rows into guild.settings.update envelopes', () => {
		const timestamp = new Date('2026-04-16T13:50:08.123Z');
		const changes = transformChanges([{ key: 'prefix', oldValue: '!', newValue: '?' }]);

		const hash = hashEnvelope({
			action: mapAction('settings.update'),
			actor: { type: 'user', id: '123456789012345678' },
			outcome: 'success',
			tenantId: '987654321098765432',
			timestamp: timestamp.toISOString(),
			changes,
			reason: null,
			requestId: null,
			traceId: null,
			prevHash: null
		});

		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('maps settings.add and settings.remove change arrays', () => {
		const timestamp = new Date('2026-04-16T13:50:08.123Z');

		const addHash = hashEnvelope({
			action: mapAction('settings.add'),
			actor: { type: 'user', id: '123456789012345678' },
			outcome: 'success',
			tenantId: '987654321098765432',
			timestamp: timestamp.toISOString(),
			changes: transformChanges([{ key: 'roles.admin', newValue: ['111'] }]),
			reason: null,
			requestId: null,
			traceId: null,
			prevHash: null
		});

		const removeHash = hashEnvelope({
			action: mapAction('settings.remove'),
			actor: { type: 'user', id: '123456789012345678' },
			outcome: 'success',
			tenantId: '987654321098765432',
			timestamp: timestamp.toISOString(),
			changes: transformChanges([{ key: 'roles.admin', oldValue: ['111'] }]),
			reason: null,
			requestId: null,
			traceId: null,
			prevHash: null
		});

		expect(addHash).not.toBe(removeHash);
	});
});
