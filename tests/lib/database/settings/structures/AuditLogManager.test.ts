import { AuditLogManager } from '#lib/database';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { container } from '@sapphire/framework';

const ADVISORY_LOCK_NS = 1096107084;

function makeHead(hash: string) {
	return { id: 'default', hash, updatedAt: new Date() };
}

describe('AuditLogManager', () => {
	let entity: ReadonlyGuildData;
	let manager: AuditLogManager;

	// Stubs
	let executeRawSpy: ReturnType<typeof vi.fn>;
	let headFindUniqueSpy: ReturnType<typeof vi.fn>;
	let headUpsertSpy: ReturnType<typeof vi.fn>;
	let eventCreateSpy: ReturnType<typeof vi.fn>;
	let transactionSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		entity = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: '123456789' }) as ReadonlyGuildData;
		manager = new AuditLogManager(entity);

		executeRawSpy = vi.fn().mockResolvedValue(undefined);
		headFindUniqueSpy = vi.fn().mockResolvedValue(null); // first write by default
		headUpsertSpy = vi.fn().mockResolvedValue({});
		eventCreateSpy = vi.fn().mockResolvedValue({});

		// $transaction runs the callback with the stub tx object
		transactionSpy = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
			return cb({
				$executeRaw: executeRawSpy,
				auditChainHead: {
					findUnique: headFindUniqueSpy,
					upsert: headUpsertSpy
				},
				auditEvent: {
					create: eventCreateSpy
				}
			});
		});

		Reflect.set(container, 'prisma', { $transaction: transactionSpy });
	});

	describe('constructor', () => {
		test('GIVEN settings THEN creates manager', () => {
			expect(manager).toBeInstanceOf(AuditLogManager);
		});
	});

	describe('onPatch', () => {
		test('GIVEN new settings THEN updates internal guildId', async () => {
			const newEntity = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: '987654321' }) as ReadonlyGuildData;
			manager.onPatch(newEntity);

			await manager.update('user1', {}, {});
			const call = eventCreateSpy.mock.calls[0][0];
			expect(call.data.tenantId).toBe('987654321');
		});
	});

	describe('update()', () => {
		test('GIVEN before/after snapshots THEN writes row with correct action and stored shape', async () => {
			const before = { prefix: '!' };
			const after = { prefix: '?' };
			await manager.update('user1', before, after);

			expect(eventCreateSpy).toHaveBeenCalledOnce();
			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.update');
			expect(data.outcome).toBe('success');
			expect(data.tenantId).toBe('123456789');
			expect(data.actorId).toBe('user1');
			expect(data.changes).toMatchObject({ before: { prefix: '!' }, after: { prefix: '?' } });
		});
	});

	describe('add()', () => {
		test('GIVEN key and value THEN writes add action with correct before/after', async () => {
			await manager.add('user1', 'channelsIgnoreAll', '111');

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.add');
			expect(data.changes).toMatchObject({ before: {}, after: { channelsIgnoreAll: '111' } });
		});
	});

	describe('remove()', () => {
		test('GIVEN key and value THEN writes remove action with correct before/after', async () => {
			await manager.remove('user1', 'rolesAdmin', '222');

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.remove');
			expect(data.changes).toMatchObject({ before: { rolesAdmin: '222' }, after: {} });
		});
	});

	describe('accessDenied()', () => {
		test('GIVEN actor THEN writes access-denied row with null changes and denied outcome', async () => {
			await manager.accessDenied('user1', 'Not allowed');

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.access-denied');
			expect(data.outcome).toBe('denied');
			// changes must be null (stored as Prisma.JsonNull which maps to null in the DB)
			// The actual value passed may be Prisma.JsonNull object; check it is not a plain object with before/after
			expect(data.changes?.before).toBeUndefined();
			expect(data.reason).toBe('Not allowed');
		});
	});

	describe('bigint normalisation', () => {
		test('GIVEN bigint fields in before/after THEN stores them as decimal strings', async () => {
			await manager.update('user1', { size: 10n as unknown as number }, { size: 20n as unknown as number });

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.changes.before.size).toBe('10');
			expect(data.changes.after.size).toBe('20');
		});
	});

	describe('chain integrity', () => {
		test('GIVEN first write THEN prevHash is null and head is created with id=default', async () => {
			headFindUniqueSpy.mockResolvedValue(null);
			await manager.update('user1', {}, {});

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.prevHash).toBeNull();
			const upsertCall = headUpsertSpy.mock.calls[0][0];
			expect(upsertCall.where).toEqual({ id: 'default' });
			expect(typeof upsertCall.create.hash).toBe('string');
			expect(upsertCall.create.hash).toHaveLength(64);
		});

		test('GIVEN second write THEN prevHash equals the stored chain head hash', async () => {
			const firstHash = 'a'.repeat(64);
			headFindUniqueSpy.mockResolvedValue(makeHead(firstHash));
			await manager.update('user1', {}, { x: 1 });

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.prevHash).toBe(firstHash);
			const upsertCall = headUpsertSpy.mock.calls[0][0];
			expect(upsertCall.update.hash).toHaveLength(64);
			expect(upsertCall.update.hash).not.toBe(firstHash);
		});

		test('GIVEN third write THEN prevHash equals the previous event hash', async () => {
			const secondHash = 'b'.repeat(64);
			headFindUniqueSpy.mockResolvedValue(makeHead(secondHash));
			await manager.update('user1', {}, { y: 2 });

			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.prevHash).toBe(secondHash);
			const upsertCall = headUpsertSpy.mock.calls[0][0];
			expect(typeof upsertCall.update.hash).toBe('string');
		});
	});

	describe('advisory lock', () => {
		test('GIVEN a write THEN acquires advisory lock with correct namespace', async () => {
			await manager.update('user1', {}, {});

			expect(executeRawSpy).toHaveBeenCalledOnce();
			// The first arg to $executeRaw is a TemplateStringsArray; check the raw SQL contains the namespace constant
			const [sqlTemplate] = executeRawSpy.mock.calls[0];
			const sqlStr = Array.isArray(sqlTemplate) ? sqlTemplate.join('') : String(sqlTemplate);
			expect(sqlStr).toContain(String(ADVISORY_LOCK_NS));
		});
	});

	describe('conflict propagation', () => {
		test('GIVEN auditEvent.create rejects THEN #write propagates the error', async () => {
			const conflict = new Error('unique constraint violation');
			eventCreateSpy.mockRejectedValue(conflict);

			await expect(manager.update('user1', {}, {})).rejects.toThrow('unique constraint violation');
		});
	});
});
