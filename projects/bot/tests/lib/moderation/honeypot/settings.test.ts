import { readSettings, writeSettings } from '#lib/database';
import {
	getMissingHoneypotLogPermissions,
	getMissingHoneypotPermissions,
	refreshHoneypotNotice,
	removeHoneypotNotice,
	withHoneypotLock
} from '#lib/moderation/honeypot/channel';
import { isHoneypotSettingsWrite, writeHoneypotSettings } from '#lib/moderation/honeypot/settings';
import { getDefaultGuildSettings, type GuildData, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('#lib/moderation/honeypot/commands', () => ({ HoneypotRoot: 'commands/honeypot' }));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	getMissingHoneypotLogPermissions: vi.fn(),
	getMissingHoneypotPermissions: vi.fn(),
	refreshHoneypotNotice: vi.fn(),
	removeHoneypotNotice: vi.fn(),
	withHoneypotLock: vi.fn()
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const otherChannelId = '254360814063058946';
const logChannelId = '254360814063058947';
const userId = '242043489611808769';

const t = (key: string) => key;

describe('writeHoneypotSettings', () => {
	// The settings of the guild, which the mocked write changes as the real one does:
	let settings: GuildData;

	function write(data: Partial<GuildData>) {
		return writeHoneypotSettings(guildId, data, userId, t as never);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		settings = { ...getDefaultGuildSettings()!, id: guildId, honeypotChannel: channelId } as GuildData;
		vi.mocked(readSettings).mockImplementation(async () => ({ ...settings }) as ReadonlyGuildData);
		vi.mocked(writeSettings).mockImplementation(async (_guild, data) => {
			Object.assign(settings, data);
		});
		vi.mocked(withHoneypotLock).mockImplementation((_guildId, callback) => callback());
		vi.mocked(getMissingHoneypotPermissions).mockResolvedValue([]);
		vi.mocked(getMissingHoneypotLogPermissions).mockResolvedValue([]);
		vi.mocked(refreshHoneypotNotice).mockResolvedValue(true);
	});

	test('GIVEN a new channel THEN its permissions are checked, it is written and the warning goes to it', async () => {
		expect(await write({ honeypotChannel: otherChannelId })).toEqual({ ok: true, notes: [] });

		expect(getMissingHoneypotPermissions).toHaveBeenCalledWith(guildId, otherChannelId, 'Softban');
		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotChannel: otherChannelId }, userId);
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, otherChannelId, { warning: true, action: 'Softban' });
	});

	test('GIVEN a channel the bot lacks a permission in THEN nothing is written', async () => {
		vi.mocked(getMissingHoneypotPermissions).mockResolvedValue(['BanMembers']);

		const result = await write({ honeypotChannel: otherChannelId });

		expect(result.ok).toBe(false);
		expect(writeSettings).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN the channel removed THEN the warning is taken off', async () => {
		expect((await write({ honeypotChannel: null })).ok).toBe(true);

		expect(removeHoneypotNotice).toHaveBeenCalledWith(guildId);
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN another action THEN its permission is checked and the warning tells about it', async () => {
		await write({ honeypotAction: 'Ban' });

		expect(getMissingHoneypotPermissions).toHaveBeenCalledWith(guildId, channelId, 'Ban');
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, channelId, { warning: true, action: 'Ban' });
	});

	test('GIVEN the warning turned off THEN the warning is refreshed, which takes it off', async () => {
		await write({ honeypotWarning: false });

		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, channelId, { warning: false, action: 'Softban' });
	});

	test('GIVEN a warning that cannot be sent THEN the write is kept and the user is told', async () => {
		vi.mocked(refreshHoneypotNotice).mockResolvedValue(false);

		expect(await write({ honeypotChannel: otherChannelId })).toEqual({ ok: true, notes: ['commands/honeypot:setupNoticeFailed'] });
		expect(settings.honeypotChannel).toBe(otherChannelId);
	});

	test('GIVEN the honeypot channel as the channel of the catches THEN nothing is written', async () => {
		const result = await write({ honeypotLogChannel: channelId });

		expect(result).toEqual({ ok: false, error: 'commands/honeypot:menuLogsSameChannel' });
		expect(writeSettings).not.toHaveBeenCalled();
	});

	test('GIVEN a channel of the catches the bot cannot post in THEN nothing is written', async () => {
		vi.mocked(getMissingHoneypotLogPermissions).mockResolvedValue(['EmbedLinks']);

		expect((await write({ honeypotLogChannel: logChannelId })).ok).toBe(false);
		expect(writeSettings).not.toHaveBeenCalled();
	});

	test('GIVEN a setting that does not change the channel nor its warning THEN only the setting is written', async () => {
		await write({ honeypotDirectMessage: false });

		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotDirectMessage: false }, userId);
		expect(getMissingHoneypotPermissions).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(removeHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN a function THEN it is given the settings read under the lock', async () => {
		await writeHoneypotSettings(guildId, (current) => ({ honeypotWarning: !current.honeypotWarning }), userId, t as never);

		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotWarning: false }, userId);
	});
});

describe('isHoneypotSettingsWrite', () => {
	test('GIVEN keys of the honeypot or of anything else THEN it tells them apart', () => {
		expect(isHoneypotSettingsWrite(['honeypotAction'])).toBe(true);
		expect(isHoneypotSettingsWrite(['language', 'honeypotChannel'])).toBe(true);
		expect(isHoneypotSettingsWrite(['language'])).toBe(false);
	});
});
