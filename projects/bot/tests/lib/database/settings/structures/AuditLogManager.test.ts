import { AuditLogManager } from '#lib/database';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { container } from '@sapphire/framework';
import { Events } from '#lib/types';
import { EmbedBuilder } from '@discordjs/builders';
import { createUser } from '../../../../mocks/MockInstances.js';

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

	describe('channel emit fan-out', () => {
		let guildStub: { id: string };
		let settingsStub: ReadonlyGuildData;
		let tStub: (key: string) => string;
		let emitSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			guildStub = { id: '123456789' };
			settingsStub = Object.assign(Object.create(null), getDefaultGuildSettings(), {
				id: '123456789',
				logsCommand: '999000111',
				logsSettings: '888000222'
			}) as unknown as ReadonlyGuildData;
			tStub = (key: string) => key;

			// Re-create the manager with channel-log settings so #emitChannelLog can
			// read logsCommand / logsSettings from the stored settings.
			manager = new AuditLogManager(settingsStub);

			vi.spyOn(container.client.guilds.cache as any, 'get').mockReturnValue(guildStub);
			emitSpy = vi.spyOn(container.client as any, 'emit').mockReturnValue(true);

			// Mock container.i18n so the real fetchT (from @sapphire/plugin-i18next,
			// already loaded by the setup file) resolves via the shared container.
			Reflect.set(container, 'i18n', {
				fetchLanguage: vi.fn().mockResolvedValue('en-US'),
				getT: vi.fn().mockReturnValue(tStub)
			});

			// Provide a real-ish User and bot user so embed builders don't crash.
			const stubbedUser = createUser();
			vi.spyOn(container.client.users, 'fetch').mockResolvedValue(stubbedUser as never);
			Reflect.set(container.client, 'user', stubbedUser);
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		test('GIVEN command() THEN writes AuditEvent with guild.command.execute action', async () => {
			await manager.command(ACTOR_ID, { commandName: 'ban', commandType: 'chat-input', channelId: '555' });
			const data = eventCreateSpy.mock.calls[0][0];
			expect(data.action).toBe('guild.command.execute');
			expect(data.outcome).toBe('success');
			expect(data.changes).toMatchObject({ after: { commandName: 'ban', commandType: 'chat-input', channelId: '555' } });
		});

		test('GIVEN command() with logsCommand set THEN emits GuildMessageLog with logsCommand key', async () => {
			await manager.command(ACTOR_ID, { commandName: 'ban', commandType: 'chat-input', channelId: '555' });
			await new Promise((r) => setImmediate(r));
			expect(emitSpy).toHaveBeenCalledWith(Events.GuildMessageLog, guildStub, '999000111', 'logsCommand', expect.any(Function));
			const makeMessage = emitSpy.mock.calls[0][4] as () => EmbedBuilder;
			expect(makeMessage()).toBeInstanceOf(EmbedBuilder);
		});

		test('GIVEN update() with logsSettings set THEN emits GuildMessageLog with logsSettings key', async () => {
			await manager.update(ACTOR_ID, { language: 'en-US' }, { language: 'es-ES' });
			await new Promise((r) => setImmediate(r));
			expect(emitSpy).toHaveBeenCalledWith(Events.GuildMessageLog, guildStub, '888000222', 'logsSettings', expect.any(Function));
		});

		test('GIVEN accessDenied() THEN emits with logsSettings key', async () => {
			await manager.accessDenied(ACTOR_ID, 'No access');
			await new Promise((r) => setImmediate(r));
			expect(emitSpy).toHaveBeenCalledWith(Events.GuildMessageLog, guildStub, '888000222', 'logsSettings', expect.any(Function));
		});

		test('GIVEN logsCommand is null THEN no emit happens but DB row is still written', async () => {
			const settingsWithNullCommand = Object.assign(Object.create(null), getDefaultGuildSettings(), {
				id: '123456789',
				logsCommand: null
			}) as unknown as ReadonlyGuildData;
			manager = new AuditLogManager(settingsWithNullCommand);
			await manager.command(ACTOR_ID, { commandName: 'kick', commandType: 'chat-input', channelId: '111' });
			await new Promise((r) => setImmediate(r));
			expect(eventCreateSpy).toHaveBeenCalledOnce();
			expect(emitSpy).not.toHaveBeenCalled();
		});

		test('GIVEN guild not in cache THEN DB write succeeds and no emit is fired', async () => {
			vi.spyOn(container.client.guilds.cache as any, 'get').mockReturnValue(undefined);
			await manager.command(ACTOR_ID, { commandName: 'kick', commandType: 'chat-input', channelId: '111' });
			await new Promise((r) => setImmediate(r));
			expect(eventCreateSpy).toHaveBeenCalledOnce();
			expect(emitSpy).not.toHaveBeenCalled();
		});

		async function getCommandEmbed(payload: Parameters<AuditLogManager['command']>[1]): Promise<ReturnType<EmbedBuilder['toJSON']>> {
			await manager.command(ACTOR_ID, payload);
			await new Promise((r) => setImmediate(r));
			const makeMessage = emitSpy.mock.calls[0][4] as () => EmbedBuilder;
			return makeMessage().toJSON();
		}

		describe('#buildCommandExecuteEmbed', () => {
			test('GIVEN chat-input without commandId THEN uses backtick fallback', async () => {
				const data = await getCommandEmbed({ commandName: 'ban', commandType: 'chat-input', channelId: '555' });
				expect(data.color).toBeDefined();
				expect(data.description).toContain('`/ban`');
			});

			test('GIVEN context-menu command THEN uses backtick format without slash', async () => {
				const data = await getCommandEmbed({ commandName: 'userinfo', commandType: 'context-menu', channelId: '555' });
				expect(data.description).toContain('`userinfo`');
			});

			test('GIVEN message command THEN uses backtick format without slash', async () => {
				const data = await getCommandEmbed({ commandName: 'userinfo', commandType: 'message', channelId: '555' });
				expect(data.description).toContain('`userinfo`');
			});

			test('GIVEN chat-input with commandId and no subcommand THEN uses slash mention', async () => {
				const data = await getCommandEmbed({
					commandName: 'ban',
					commandId: '111111111111111111',
					commandType: 'chat-input',
					channelId: '555'
				});
				expect(data.description).toContain('</ban:111111111111111111>');
			});

			test('GIVEN chat-input with commandId and one subcommand THEN uses slash mention', async () => {
				const data = await getCommandEmbed({
					commandName: 'mod ban',
					commandId: '222222222222222222',
					commandType: 'chat-input',
					channelId: '555'
				});
				expect(data.description).toContain('</mod ban:222222222222222222>');
			});

			test('GIVEN chat-input with commandId and subcommand group THEN uses slash mention', async () => {
				const data = await getCommandEmbed({
					commandName: 'config settings reset',
					commandId: '333333333333333333',
					commandType: 'chat-input',
					channelId: '555'
				});
				expect(data.description).toContain('</config settings reset:333333333333333333>');
			});

			test('GIVEN chat-input with multi-word name but no commandId THEN uses backtick fallback with slash', async () => {
				const data = await getCommandEmbed({ commandName: 'mod warn', commandType: 'chat-input', channelId: '555' });
				expect(data.description).toContain('`/mod warn`');
			});

			test('GIVEN command() THEN embed has author and correct channel mention in description', async () => {
				const data = await getCommandEmbed({ commandName: 'kick', commandType: 'chat-input', channelId: '987654321098765432' });
				expect(data.author).toBeDefined();
				expect(data.description).toContain('<#987654321098765432>');
			});
		});

		describe('#buildSettingsChangeEmbed', () => {
			async function getSettingsEmbed(
				before: Record<string, unknown>,
				after: Record<string, unknown>
			): Promise<ReturnType<EmbedBuilder['toJSON']>> {
				await manager.update(ACTOR_ID, before, after);
				await new Promise((r) => setImmediate(r));
				const makeMessage = emitSpy.mock.calls[0][4] as () => EmbedBuilder;
				return makeMessage().toJSON();
			}

			test('GIVEN settings update THEN embed has diff field for changed key', async () => {
				const data = await getSettingsEmbed({ language: 'en-US' }, { language: 'es-ES' });
				expect(data.fields!.length).toBeGreaterThanOrEqual(1);
				const changeField = data.fields!.find((f) => f.name === 'language');
				expect(changeField).toBeDefined();
			});

			test('GIVEN access-denied THEN embed carries the reason', async () => {
				await manager.accessDenied(ACTOR_ID, 'Unauthorized');
				await new Promise((r) => setImmediate(r));
				const makeMessage = emitSpy.mock.calls[0][4] as () => EmbedBuilder;
				const data = makeMessage().toJSON();
				expect(data.description).toContain('Unauthorized');
			});
		});
	});
});
