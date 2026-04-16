import { AuditLogManager, type AuditLogChange } from '#lib/database';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { container } from '@sapphire/framework';

describe('AuditLogManager', () => {
	let entity: ReadonlyGuildData;
	let manager: AuditLogManager;
	const createSpy = vi.fn().mockResolvedValue({});

	beforeEach(() => {
		entity = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: '123456789' }) as ReadonlyGuildData;
		manager = new AuditLogManager(entity);
		createSpy.mockClear();
		Reflect.set(container, 'prisma', { auditLog: { create: createSpy } });
	});

	describe('constructor', () => {
		test('GIVEN settings THEN creates manager', () => {
			expect(manager).toBeInstanceOf(AuditLogManager);
		});
	});

	describe('onPatch', () => {
		test('GIVEN new settings THEN updates internal state', () => {
			const newEntity = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: '987654321' }) as ReadonlyGuildData;
			manager.onPatch(newEntity);

			// Verify by calling write which uses the guildId
			manager.write('user1', { action: 'test', section: 'general', changes: [] });
			expect(createSpy).toHaveBeenCalledWith({
				data: expect.objectContaining({ guildId: '987654321' })
			});
		});
	});

	describe('update', () => {
		test('GIVEN new data THEN writes changes with old and new values', async () => {
			await manager.update('user1', { prefix: '!' });

			expect(createSpy).toHaveBeenCalledOnce();
			const call = createSpy.mock.calls[0][0];
			expect(call.data.guildId).toBe('123456789');
			expect(call.data.userId).toBe('user1');
			expect(call.data.action).toBe('settings.update');
			expect(call.data.changes).toEqual<AuditLogChange[]>([{ key: 'prefix', oldValue: entity.prefix, newValue: '!' }]);
		});

		test('GIVEN multiple keys THEN writes all changes', async () => {
			await manager.update('user1', { prefix: '!', language: 'es-ES' });

			const call = createSpy.mock.calls[0][0];
			expect(call.data.changes).toHaveLength(2);
		});
	});

	describe('add', () => {
		test('GIVEN key and value THEN writes add action', async () => {
			await manager.add('user1', 'channelsIgnoreAll', '111');

			expect(createSpy).toHaveBeenCalledOnce();
			const call = createSpy.mock.calls[0][0];
			expect(call.data.action).toBe('settings.add');
			expect(call.data.section).toBe('channels');
			expect(call.data.changes).toEqual<AuditLogChange[]>([{ key: 'channelsIgnoreAll', newValue: '111' }]);
		});
	});

	describe('remove', () => {
		test('GIVEN key and value THEN writes remove action', async () => {
			await manager.remove('user1', 'rolesAdmin', '222');

			expect(createSpy).toHaveBeenCalledOnce();
			const call = createSpy.mock.calls[0][0];
			expect(call.data.action).toBe('settings.remove');
			expect(call.data.section).toBe('roles');
			expect(call.data.changes).toEqual<AuditLogChange[]>([{ key: 'rolesAdmin', oldValue: '222' }]);
		});
	});

	describe('deriveSection', () => {
		// Access via update which calls deriveSection internally
		test('GIVEN permission keys THEN derives permissions section', async () => {
			await manager.update('user1', { permissionsUsers: [] });
			expect(createSpy.mock.calls[0][0].data.section).toBe('permissions');
		});

		test('GIVEN selfmod keys THEN derives moderation section', async () => {
			await manager.update('user1', { selfmodCapitalsEnabled: true });
			expect(createSpy.mock.calls[0][0].data.section).toBe('moderation');
		});

		test('GIVEN channel keys THEN derives channels section', async () => {
			await manager.update('user1', { channelsIgnoreAll: [] });
			expect(createSpy.mock.calls[0][0].data.section).toBe('channels');
		});

		test('GIVEN role keys THEN derives roles section', async () => {
			await manager.update('user1', { rolesAdmin: null });
			expect(createSpy.mock.calls[0][0].data.section).toBe('roles');
		});

		test('GIVEN event keys THEN derives events section', async () => {
			await manager.update('user1', { eventsMessageEdit: false });
			expect(createSpy.mock.calls[0][0].data.section).toBe('events');
		});

		test('GIVEN message keys THEN derives messages section', async () => {
			await manager.update('user1', { messagesGreeting: '' });
			expect(createSpy.mock.calls[0][0].data.section).toBe('messages');
		});

		test('GIVEN disabled keys THEN derives commands section', async () => {
			await manager.update('user1', { disabledCommands: [] });
			expect(createSpy.mock.calls[0][0].data.section).toBe('commands');
		});

		test('GIVEN unclassified keys THEN derives general section', async () => {
			await manager.update('user1', { prefix: '!' });
			expect(createSpy.mock.calls[0][0].data.section).toBe('general');
		});

		test('GIVEN mixed keys THEN derives most common section', async () => {
			await manager.update('user1', { channelsIgnoreAll: [], channelsMediaOnly: [], prefix: '!' });
			expect(createSpy.mock.calls[0][0].data.section).toBe('channels');
		});
	});

	describe('serializeValue', () => {
		test('GIVEN bigint value THEN serializes to number', async () => {
			await manager.update('user1', { prefix: BigInt(42) as unknown });
			const call = createSpy.mock.calls[0][0];
			expect(call.data.changes[0].newValue).toBe(42);
		});

		test('GIVEN string value THEN keeps as-is', async () => {
			await manager.update('user1', { prefix: '!' });
			const call = createSpy.mock.calls[0][0];
			expect(call.data.changes[0].newValue).toBe('!');
		});

		test('GIVEN null value THEN keeps as-is', async () => {
			await manager.update('user1', { prefix: null });
			const call = createSpy.mock.calls[0][0];
			expect(call.data.changes[0].newValue).toBeNull();
		});
	});
});
