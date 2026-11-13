import { AuditLogManager, getConfigurableKeys } from '#lib/database';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';
import { container } from '@wolfstar/http-framework';

const ADVISORY_LOCK_NS = 1096107084;
const ACTOR_ID = '111111111111111111';

function makeHead(hash: string) {
	return { id: 'default', hash, updatedAt: new Date() };
}

describe('AuditLogManager', () => {
	let entity: ReadonlyGuildData;
	let manager: AuditLogManager;

	// Stubs
	let executeSpy: ReturnType<typeof vi.fn>;
	let rawSqlSpy: ReturnType<typeof vi.fn>;
	let headFirstSpy: ReturnType<typeof vi.fn>;
	let headUpsertSpy: ReturnType<typeof vi.fn>;
	let eventCreateSpy: ReturnType<typeof vi.fn>;
	let transactionSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		entity = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: '123456789' }) as ReadonlyGuildData;
		manager = new AuditLogManager(entity);

		executeSpy = vi.fn().mockResolvedValue({ affectedRows: 1 });
		rawSqlSpy = vi.fn((strings: TemplateStringsArray) => ({
			affectedCount: () => ({ build: () => ({ sql: strings.join('') }) })
		}));
		headFirstSpy = vi.fn().mockResolvedValue(null); // first write by default
		headUpsertSpy = vi.fn().mockResolvedValue({});
		eventCreateSpy = vi.fn().mockResolvedValue({});

		// transaction runs the callback with the stub tx object
		transactionSpy = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
			return cb({
				execute: executeSpy,
				orm: {
					public: {
						AuditChainHead: { first: headFirstSpy, upsert: headUpsertSpy },
						AuditEvent: { create: eventCreateSpy }
					}
				}
			});
		});

		Reflect.set(container, 'prisma', { transaction: transactionSpy, raw: { sql: rawSqlSpy } });
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

			await manager.update(ACTOR_ID, {}, {});
			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.tenantId).toBe(987654321n);
		});
	});

	describe('update()', () => {
		test('GIVEN before/after snapshots THEN writes row with correct action and stored shape', async () => {
			const before = { language: 'en-US' };
			const after = { language: 'es-ES' };
			await manager.update(ACTOR_ID, before, after);

			expect(eventCreateSpy).toHaveBeenCalledOnce();
			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.update');
			expect(data.outcome).toBe('success');
			expect(data.tenantId).toBe(123456789n);
			expect(data.actorId).toBe(BigInt(ACTOR_ID));
			expect(data.changes).toMatchObject({ before: { language: 'en-US' }, after: { language: 'es-ES' } });
		});
	});

	describe('add()', () => {
		test('GIVEN key and value THEN writes add action with correct before/after', async () => {
			await manager.add(ACTOR_ID, 'logsIgnoreAll', '111');

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.add');
			expect(data.changes).toMatchObject({ before: {}, after: { logsIgnoreAll: '111' } });
		});
	});

	describe('remove()', () => {
		test('GIVEN key and value THEN writes remove action with correct before/after', async () => {
			await manager.remove(ACTOR_ID, 'rolesAdmin', '222');

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.remove');
			expect(data.changes).toMatchObject({ before: { rolesAdmin: '222' }, after: {} });
		});
	});

	describe('accessDenied()', () => {
		test('GIVEN actor THEN writes access-denied row with null changes and denied outcome', async () => {
			await manager.accessDenied(ACTOR_ID, 'Not allowed');

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.settings.access-denied');
			expect(data.outcome).toBe('denied');
			// changes must be null (a NULL `changes` column)
			expect(data.changes).toBeNull();
			expect(data.reason).toBe('Not allowed');
		});
	});

	describe('bigint normalisation', () => {
		test('GIVEN bigint fields in before/after THEN stores them as decimal strings', async () => {
			await manager.update(ACTOR_ID, { size: 10n as unknown as number }, { size: 20n as unknown as number });

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.changes.before.size).toBe('10');
			expect(data.changes.after.size).toBe('20');
		});
	});

	describe('chain integrity', () => {
		test('GIVEN first write THEN prevHash is null and head is created with id=default', async () => {
			headFirstSpy.mockResolvedValue(null);
			await manager.update(ACTOR_ID, {}, {});

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.prevHash).toBeNull();
			const upsertCall = headUpsertSpy.mock.calls[0][0];
			expect(upsertCall.create.id).toBe('default');
			expect(typeof upsertCall.create.hash).toBe('string');
			expect(upsertCall.create.hash).toHaveLength(64);
		});

		test('GIVEN second write THEN prevHash equals the stored chain head hash', async () => {
			const firstHash = 'a'.repeat(64);
			headFirstSpy.mockResolvedValue(makeHead(firstHash));
			await manager.update(ACTOR_ID, {}, { x: 1 });

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.prevHash).toBe(firstHash);
			const upsertCall = headUpsertSpy.mock.calls[0][0];
			expect(upsertCall.update.hash).toHaveLength(64);
			expect(upsertCall.update.hash).not.toBe(firstHash);
		});

		test('GIVEN third write THEN prevHash equals the previous event hash', async () => {
			const secondHash = 'b'.repeat(64);
			headFirstSpy.mockResolvedValue(makeHead(secondHash));
			await manager.update(ACTOR_ID, {}, { y: 2 });

			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.prevHash).toBe(secondHash);
			const upsertCall = headUpsertSpy.mock.calls[0][0];
			expect(typeof upsertCall.update.hash).toBe('string');
		});
	});

	describe('advisory lock', () => {
		test('GIVEN a write THEN acquires advisory lock with correct namespace', async () => {
			await manager.update(ACTOR_ID, {}, {});

			expect(executeSpy).toHaveBeenCalledOnce();
			// The raw lane receives the SQL as a TemplateStringsArray; check it contains the namespace constant
			const [plan] = executeSpy.mock.calls[0];
			expect(plan.sql).toContain(String(ADVISORY_LOCK_NS));
		});
	});

	describe('conflict propagation', () => {
		test('GIVEN AuditEvent.create rejects THEN #write propagates the error', async () => {
			const conflict = new Error('unique constraint violation');
			eventCreateSpy.mockRejectedValue(conflict);

			await expect(manager.update(ACTOR_ID, {}, {})).rejects.toThrow('unique constraint violation');
		});
	});

	describe('command()', () => {
		test('GIVEN command() THEN writes AuditEvent with guild.command.execute action', async () => {
			await manager.command(ACTOR_ID, { commandName: 'ban', commandType: 'chat-input', channelId: '555' });
			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.command.execute');
			expect(data.outcome).toBe('success');
			expect(data.changes).toMatchObject({ after: { commandName: 'ban', commandType: 'chat-input', channelId: '555' } });
		});
	});

	describe('web only', () => {
		test('GIVEN a command or a change of the settings THEN nothing is sent to a channel of the guild', async () => {
			const emit = vi.fn();
			const previous = (container as any).gatewayClient;
			(container as any).gatewayClient = { emit };

			await manager.command(ACTOR_ID, { commandName: 'ban', commandType: 'chat-input', channelId: '555' });
			await manager.update(ACTOR_ID, { prefix: '!' }, { prefix: '?' });
			await manager.accessDenied(ACTOR_ID, 'Unauthorized');

			expect(eventCreateSpy).toHaveBeenCalledTimes(3);
			expect(emit).not.toHaveBeenCalled();
			(container as any).gatewayClient = previous;
		});

		test('GIVEN the settings of a guild THEN there is no channel to set for the two logs', () => {
			const settings = getDefaultGuildSettings() as Record<string, unknown>;

			expect('logsCommand' in settings).toBe(false);
			expect('logsSettings' in settings).toBe(false);
			expect(getConfigurableKeys().has('logsCommand' as never)).toBe(false);
			expect(getConfigurableKeys().has('logsSettings' as never)).toBe(false);
		});
	});
});
