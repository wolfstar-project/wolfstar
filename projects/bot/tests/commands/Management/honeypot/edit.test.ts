import { readSettings, writeSettings } from '#lib/database';
import {
	getMissingHoneypotLogPermissions,
	getMissingHoneypotPermissions,
	refreshHoneypotNotice,
	removeHoneypotNotice,
	withHoneypotLock
} from '#lib/moderation/honeypot/channel';
import { UserCommand as DisableCommand } from '#root/commands/Management/honeypot/disable';
import { UserCommand as EditCommand } from '#root/commands/Management/honeypot/edit';
import { getDefaultGuildSettings, type GuildData, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('#lib/moderation/honeypot/commands', () => ({
	HoneypotRoot: 'commands/honeypot',
	HoneypotActionKeys: { Kick: 'kick', Softban: 'softban', Ban: 'ban' },
	renderHoneypotSummary: vi.fn(() => ({ toJSON: () => ({}) }))
}));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	getMissingHoneypotLogPermissions: vi.fn(),
	getMissingHoneypotPermissions: vi.fn(),
	refreshHoneypotNotice: vi.fn(),
	removeHoneypotNotice: vi.fn(),
	withHoneypotLock: vi.fn()
}));
vi.mock('#lib/structures/commands/utils', () => ({
	translateKey: (_t: unknown, key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)
}));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: vi.fn(() => (key: string) => key)
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const logChannelId = '254360814063058947';
const userId = '242043489611808769';

describe('/honeypot edit and /honeypot disable', () => {
	const update = vi.fn(async (data: { content: string }) => data);
	// The settings of the guild, which the mocked writes change as the real ones do:
	let settings: GuildData;
	// The lock of the honeypot, as a queue: what takes it runs after what holds it.
	let tail: Promise<unknown>;

	function createInteraction() {
		return { guildId, user: { id: userId }, defer: vi.fn(async () => ({ update })), reply: vi.fn() } as never;
	}

	function edit(options: Record<string, unknown>) {
		return EditCommand.prototype.chatInputRun.call({} as never, createInteraction(), options as never);
	}

	function disable() {
		return DisableCommand.prototype.chatInputRun.call({} as never, createInteraction());
	}

	beforeEach(() => {
		vi.clearAllMocks();
		settings = { ...getDefaultGuildSettings()!, id: guildId, honeypotChannel: channelId } as GuildData;
		tail = Promise.resolve();

		vi.mocked(readSettings).mockImplementation(async () => ({ ...settings }) as ReadonlyGuildData);
		vi.mocked(writeSettings).mockImplementation(async (_guild, data) => {
			// A write takes a moment, which is when another command gets to run:
			await new Promise((resolve) => setTimeout(resolve, 5));
			Object.assign(settings, data);
		});
		vi.mocked(withHoneypotLock).mockImplementation((_guildId, callback) => {
			const result = tail.then(callback);
			tail = result.catch(() => undefined);
			return result;
		});
		vi.mocked(getMissingHoneypotPermissions).mockResolvedValue([]);
		vi.mocked(getMissingHoneypotLogPermissions).mockResolvedValue([]);
		vi.mocked(refreshHoneypotNotice).mockResolvedValue(true);
	});

	test('GIVEN another action THEN it is saved and the warning tells about it', async () => {
		await edit({ action: 'Ban' });

		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotAction: 'Ban' }, userId);
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, channelId, { warning: true, action: 'Ban' });
	});

	test('GIVEN a setting the warning does not tell about THEN the warning is left alone', async () => {
		await edit({ 'random-name': true });

		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotRandomName: true }, userId);
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN a logs channel the bot cannot post in THEN it is refused with what is missing', async () => {
		vi.mocked(getMissingHoneypotLogPermissions).mockResolvedValue(['SendMessages', 'EmbedLinks']);

		await edit({ logs: { id: logChannelId } });

		expect(writeSettings).not.toHaveBeenCalled();
		expect(update.mock.calls.at(-1)![0].content).toBe(
			`commands/honeypot:logsMissingPermissions {"channel":"<#${logChannelId}>","missing":["SendMessages","EmbedLinks"]}`
		);
	});

	test('GIVEN a logs channel the bot can post in THEN it is saved', async () => {
		await edit({ logs: { id: logChannelId } });

		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotLogChannel: logChannelId }, userId);
	});

	test('GIVEN a disable THEN the channel is cleared and its warning removed, under the lock', async () => {
		await disable();

		expect(withHoneypotLock).toHaveBeenCalledWith(guildId, expect.any(Function));
		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotChannel: null }, userId);
		expect(removeHoneypotNotice).toHaveBeenCalledWith(guildId);
	});

	test('GIVEN a disable that runs while an edit does THEN the warning is gone in the end', async () => {
		const order: string[] = [];
		vi.mocked(refreshHoneypotNotice).mockImplementation(async () => {
			order.push('refresh');
			return true;
		});
		vi.mocked(removeHoneypotNotice).mockImplementation(async () => {
			order.push('remove');
		});

		const editing = edit({ warning: true });
		// The edit holds the lock, and is in the middle of its write, when the disable starts:
		await vi.waitFor(() => expect(writeSettings).toHaveBeenCalledTimes(1));
		await Promise.all([editing, disable()]);

		expect(order).toEqual(['refresh', 'remove']);
		expect(settings.honeypotChannel).toBeNull();
	});

	test('GIVEN an edit that runs while a disable does THEN no warning is sent to the channel that is not a trap anymore', async () => {
		const disabling = disable();
		// The disable holds the lock, and is in the middle of its write, when the edit starts:
		await vi.waitFor(() => expect(writeSettings).toHaveBeenCalledTimes(1));
		await Promise.all([disabling, edit({ warning: true })]);

		expect(removeHoneypotNotice).toHaveBeenCalledTimes(1);
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(settings.honeypotWarning).toBe(true);
	});
});
