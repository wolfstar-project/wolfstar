import { AuditLogManager } from '#lib/database';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { container } from '@sapphire/framework';
import { Events } from '#lib/types';
import { EmbedBuilder } from '@discordjs/builders';

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

	describe('channel emit fan-out', () => {
		let guildStub: { id: string };
		let settingsStub: ReadonlyGuildData;
		let tStub: (key: string) => string;
		let emitSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			guildStub = { id: '123456789' };
			settingsStub = Object.assign(Object.create(null), getDefaultGuildSettings(), {
				id: '123456789',
				channelsLogsCommand: '999000111',
				channelsLogsSettings: '888000222'
			}) as unknown as ReadonlyGuildData;
			tStub = (key: string) => key;

			// Re-create the manager with channel-log settings so #emitChannelLog can
			// read channelsLogsCommand / channelsLogsSettings from the stored settings.
			manager = new AuditLogManager(settingsStub);

			vi.spyOn(container.client.guilds.cache as any, 'get').mockReturnValue(guildStub);
			emitSpy = vi.spyOn(container.client as any, 'emit').mockReturnValue(true);

			// Mock container.i18n so the real fetchT (from @sapphire/plugin-i18next,
			// already loaded by the setup file) resolves via the shared container.
			Reflect.set(container, 'i18n', {
				fetchLanguage: vi.fn().mockResolvedValue('en-US'),
				getT: vi.fn().mockReturnValue(tStub)
			});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		test('GIVEN command() THEN writes AuditEvent with guild.command.execute action', async () => {
			await manager.command('user1', { commandName: 'ban', commandType: 'chat-input', channelId: '555' });
			const { data } = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.command.execute');
			expect(data.outcome).toBe('success');
			expect(data.changes).toMatchObject({ after: { commandName: 'ban', commandType: 'chat-input', channelId: '555' } });
		});

		test('GIVEN command() with channelsLogsCommand set THEN emits GuildMessageLog with channelsLogsCommand key', async () => {
			await manager.command('user1', { commandName: 'ban', commandType: 'chat-input', channelId: '555' });
			await new Promise((r) => setImmediate(r));
			expect(emitSpy).toHaveBeenCalledWith(Events.GuildMessageLog, guildStub, '999000111', 'channelsLogsCommand', expect.any(Function));
			const makeMessage = emitSpy.mock.calls[0][4] as () => EmbedBuilder;
			expect(makeMessage()).toBeInstanceOf(EmbedBuilder);
		});

		test('GIVEN update() with channelsLogsSettings set THEN emits GuildMessageLog with channelsLogsSettings key', async () => {
			await manager.update('user1', { prefix: '!' }, { prefix: '?' });
			await new Promise((r) => setImmediate(r));
			expect(emitSpy).toHaveBeenCalledWith(Events.GuildMessageLog, guildStub, '888000222', 'channelsLogsSettings', expect.any(Function));
		});

		test('GIVEN accessDenied() THEN emits with channelsLogsSettings key', async () => {
			await manager.accessDenied('user1', 'No access');
			await new Promise((r) => setImmediate(r));
			expect(emitSpy).toHaveBeenCalledWith(Events.GuildMessageLog, guildStub, '888000222', 'channelsLogsSettings', expect.any(Function));
		});

		test('GIVEN channelsLogsCommand is null THEN no emit happens but DB row is still written', async () => {
			const settingsWithNullCommand = Object.assign(Object.create(null), getDefaultGuildSettings(), {
				id: '123456789',
				channelsLogsCommand: null
			}) as unknown as ReadonlyGuildData;
			manager = new AuditLogManager(settingsWithNullCommand);
			await manager.command('user1', { commandName: 'kick', commandType: 'chat-input', channelId: '111' });
			await new Promise((r) => setImmediate(r));
			expect(eventCreateSpy).toHaveBeenCalledOnce();
			expect(emitSpy).not.toHaveBeenCalled();
		});

		test('GIVEN guild not in cache THEN DB write succeeds and no emit is fired', async () => {
			vi.spyOn(container.client.guilds.cache as any, 'get').mockReturnValue(undefined);
			await manager.command('user1', { commandName: 'kick', commandType: 'chat-input', channelId: '111' });
			await new Promise((r) => setImmediate(r));
			expect(eventCreateSpy).toHaveBeenCalledOnce();
			expect(emitSpy).not.toHaveBeenCalled();
		});
	});
});
