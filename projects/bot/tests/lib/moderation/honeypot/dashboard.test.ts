import { readSettings } from '#lib/database';
import { refreshHoneypotNotice, removeHoneypotNotice, withHoneypotLock } from '#lib/moderation/honeypot/channel';
import { followHoneypotSettings } from '#lib/moderation/honeypot/dashboard';
import { Events } from '#lib/types/Enums';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	withHoneypotLock: vi.fn((_guildId: string, callback: () => Promise<unknown>) => callback()),
	refreshHoneypotNotice: vi.fn(async () => true),
	removeHoneypotNotice: vi.fn(async () => undefined)
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const guild = { id: guildId };

function settings(overrides: Partial<ReadonlyGuildData> = {}) {
	vi.mocked(readSettings).mockResolvedValue({
		...getDefaultGuildSettings()!,
		id: guildId,
		honeypotChannel: channelId,
		...overrides
	} as ReadonlyGuildData);
}

describe('followHoneypotSettings', () => {
	const emit = vi.fn();
	const warn = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(container, { client: { emit }, logger: { warn }, gatewayClient: { guilds: { resolve: vi.fn(async () => guild) } } });
	});

	test('GIVEN the honeypot turned off THEN its warning goes, under its lock', async () => {
		settings({ honeypotChannel: null });

		expect(await followHoneypotSettings(guildId, ['honeypotChannel'])).toBe('Removed');
		expect(withHoneypotLock).toHaveBeenCalledWith(guildId, expect.any(Function));
		expect(removeHoneypotNotice).toHaveBeenCalledWith(guildId);
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test.each(['honeypotChannel', 'honeypotAction', 'honeypotWarning'])(
		'GIVEN %s changed THEN the warning is sent again as the settings say',
		async (key) => {
			settings({ honeypotAction: 'Ban', honeypotWarning: false });

			expect(await followHoneypotSettings(guildId, [key])).toBe('Refreshed');
			expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, channelId, { warning: false, action: 'Ban' });
		}
	);

	test('GIVEN other settings changed THEN the warning is left alone and the lock is not taken', async () => {
		expect(await followHoneypotSettings(guildId, ['honeypotLogChannel', 'logsWebhooks'])).toBe('Ignored');
		expect(withHoneypotLock).not.toHaveBeenCalled();
		expect(readSettings).not.toHaveBeenCalled();
	});

	test('GIVEN a warning that cannot be sent THEN nothing is written and the log of the honeypot is told', async () => {
		settings({ honeypotLogChannel: '900' });
		vi.mocked(refreshHoneypotNotice).mockResolvedValueOnce(false);

		expect(await followHoneypotSettings(guildId, ['honeypotChannel'])).toBe('Failed');
		expect(emit).toHaveBeenCalledWith(Events.GuildMessageLog, guild, '900', 'honeypotLogChannel', expect.any(Function));
		expect((emit.mock.calls[0][4] as () => { content: string })().content).toBe('commands/honeypot:dashboardNoticeFailed');
	});

	test('GIVEN a warning that cannot be sent and no log channel THEN it is only logged', async () => {
		settings();
		vi.mocked(refreshHoneypotNotice).mockResolvedValueOnce(false);

		expect(await followHoneypotSettings(guildId, ['honeypotWarning'])).toBe('Failed');
		expect(emit).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
