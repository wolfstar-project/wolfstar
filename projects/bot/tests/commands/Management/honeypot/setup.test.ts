import { readSettings, writeSettings } from '#lib/database';
import {
	createHoneypotChannel,
	deleteHoneypotChannel,
	getMissingHoneypotGuildPermissions,
	getMissingHoneypotLogPermissions,
	getMissingHoneypotPermissions,
	refreshHoneypotNotice
} from '#lib/moderation/honeypot/channel';
import { UserCommand } from '#root/commands/Management/honeypot/setup';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('#lib/moderation/honeypot/commands', () => ({
	HoneypotRoot: 'commands/honeypot',
	HoneypotActionKeys: { Kick: 'kick', Softban: 'softban', Ban: 'ban' },
	renderHoneypotSummary: vi.fn(() => ({ toJSON: () => ({}) }))
}));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	createHoneypotChannel: vi.fn(),
	deleteHoneypotChannel: vi.fn(),
	getMissingHoneypotGuildPermissions: vi.fn(),
	getMissingHoneypotLogPermissions: vi.fn(),
	getMissingHoneypotPermissions: vi.fn(),
	refreshHoneypotNotice: vi.fn(),
	withHoneypotLock: vi.fn((_guildId: string, callback: () => Promise<unknown>) => callback())
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
const createdId = '254360814063058946';
const logChannelId = '254360814063058947';
const userId = '242043489611808769';

function createSettings(overrides: Partial<ReadonlyGuildData> = {}) {
	return { ...getDefaultGuildSettings()!, id: guildId, ...overrides } as ReadonlyGuildData;
}

describe('/honeypot setup', () => {
	const update = vi.fn(async (data: { content: string }) => data);

	function run(options: Record<string, unknown> = {}) {
		const interaction = { guildId, user: { id: userId }, defer: vi.fn(async () => ({ update })) };
		return UserCommand.prototype.chatInputRun.call({} as never, interaction as never, options as never);
	}

	function readAnswer() {
		return update.mock.calls.at(-1)![0].content;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(readSettings).mockResolvedValue(createSettings());
		vi.mocked(createHoneypotChannel).mockResolvedValue(createdId);
		vi.mocked(getMissingHoneypotGuildPermissions).mockResolvedValue([]);
		vi.mocked(getMissingHoneypotPermissions).mockResolvedValue([]);
		vi.mocked(getMissingHoneypotLogPermissions).mockResolvedValue([]);
		vi.mocked(refreshHoneypotNotice).mockResolvedValue(true);
	});

	test('GIVEN no channel THEN one is created, saved and given its warning', async () => {
		await run();

		expect(createHoneypotChannel).toHaveBeenCalledWith(guildId);
		expect(writeSettings).toHaveBeenCalledWith(
			guildId,
			{ honeypotChannel: createdId, honeypotAction: 'Softban', honeypotLogChannel: null },
			userId
		);
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, createdId, { warning: true, action: 'Softban' });
		expect(deleteHoneypotChannel).not.toHaveBeenCalled();
		expect(readAnswer()).toContain('commands/honeypot:setupCreated');
	});

	test('GIVEN a bot that lacks the permission of the action THEN no channel is created, however often it is tried', async () => {
		vi.mocked(getMissingHoneypotGuildPermissions).mockResolvedValue(['BanMembers']);

		await run();
		await run();

		expect(getMissingHoneypotGuildPermissions).toHaveBeenCalledWith(guildId, 'Softban');
		expect(createHoneypotChannel).not.toHaveBeenCalled();
		expect(writeSettings).not.toHaveBeenCalled();
		expect(readAnswer()).toBe('commands/honeypot:setupMissingPermissions {"missing":["BanMembers"]}');
	});

	test('GIVEN a created channel the honeypot cannot run in THEN it is deleted and nothing is saved', async () => {
		vi.mocked(getMissingHoneypotPermissions).mockResolvedValue(['ManageMessages']);

		await run();

		expect(deleteHoneypotChannel).toHaveBeenCalledWith(createdId);
		expect(writeSettings).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(readAnswer()).toContain('commands/honeypot:missingPermissions');
	});

	test('GIVEN settings that cannot be saved THEN the created channel is deleted and the error is not swallowed', async () => {
		vi.mocked(writeSettings).mockRejectedValueOnce(new Error('boom'));

		await expect(run()).rejects.toThrow('boom');
		expect(deleteHoneypotChannel).toHaveBeenCalledWith(createdId);
	});

	test('GIVEN a channel of the server the honeypot cannot run in THEN it is refused and never deleted', async () => {
		vi.mocked(getMissingHoneypotPermissions).mockResolvedValue(['ManageMessages']);

		await run({ channel: { id: channelId } });

		expect(createHoneypotChannel).not.toHaveBeenCalled();
		expect(deleteHoneypotChannel).not.toHaveBeenCalled();
		expect(writeSettings).not.toHaveBeenCalled();
	});

	test('GIVEN a honeypot that moves to another channel THEN the warning is refreshed for the new one', async () => {
		vi.mocked(readSettings).mockResolvedValue(createSettings({ honeypotChannel: channelId }));

		await run({ channel: { id: createdId } });

		expect(writeSettings).toHaveBeenCalledWith(guildId, expect.objectContaining({ honeypotChannel: createdId }), userId);
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, createdId, { warning: true, action: 'Softban' });
	});

	test('GIVEN a logs channel the bot cannot post in THEN it is refused with what is missing, before anything is created', async () => {
		vi.mocked(getMissingHoneypotLogPermissions).mockResolvedValue(['EmbedLinks']);

		await run({ logs: { id: logChannelId } });

		expect(getMissingHoneypotLogPermissions).toHaveBeenCalledWith(guildId, logChannelId);
		expect(createHoneypotChannel).not.toHaveBeenCalled();
		expect(writeSettings).not.toHaveBeenCalled();
		expect(readAnswer()).toBe(`commands/honeypot:logsMissingPermissions {"channel":"<#${logChannelId}>","missing":["EmbedLinks"]}`);
	});
});
