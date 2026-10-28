import { readSettings } from '#lib/database';
import { refreshHoneypotNotice, removeHoneypotNotice, withHoneypotLock } from '#lib/moderation/honeypot/channel';
import { followHoneypotSettings, planHoneypotNoticeReconcile, reconcileHoneypotNotices } from '#lib/moderation/honeypot/dashboard';
import { readHoneypotNotices } from '#lib/moderation/honeypot/channel';
import { fetchHoneypotChannels } from 'wolfstar-database';
import { Events } from '#lib/types/Enums';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	withHoneypotLock: vi.fn((_guildId: string, callback: () => Promise<unknown>) => callback()),
	refreshHoneypotNotice: vi.fn(async () => true),
	removeHoneypotNotice: vi.fn(async () => undefined),
	readHoneypotNotices: vi.fn(async () => new Map())
}));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchHoneypotChannels: vi.fn(async () => [])
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

describe('planHoneypotNoticeReconcile', () => {
	const honeypot = { channelId, warning: true, action: 'Softban' as const };
	const notice = { channelId, messageId: '1', action: 'Softban' as const };

	test.each([
		['a honeypot with its warning', honeypot, notice, 'Keep'],
		['a honeypot whose warning is missing', honeypot, null, 'Refresh'],
		['a honeypot that moved', { ...honeypot, channelId: '2' }, notice, 'Refresh'],
		['an action the warning does not tell', { ...honeypot, action: 'Ban' as const }, notice, 'Refresh'],
		['a warning sent before its action was kept', honeypot, { ...notice, action: null }, 'Keep'],
		['a honeypot turned off with its warning left', null, notice, 'Remove'],
		['a honeypot that wants no warning and has one', { ...honeypot, warning: false }, notice, 'Remove'],
		['a honeypot that wants no warning and has none', { ...honeypot, warning: false }, null, 'Keep'],
		['nothing', null, null, 'Keep']
	] as const)('GIVEN %s THEN the warning is put in order', (_, current, tracked, expected) => {
		expect(planHoneypotNoticeReconcile(current, tracked)).toBe(expected);
	});
});

describe('reconcileHoneypotNotices', () => {
	const other = '266624760782258186';

	// The guilds the bot is in, as the gateway caches them:
	let joined = new Set<string>();

	beforeEach(() => {
		vi.clearAllMocks();
		joined = new Set([guildId, other, '242043489611808769']);
		Object.assign(container, {
			shard: null,
			prisma: { orm: {} },
			logger: { warn: vi.fn(), error: vi.fn() },
			client: { emit: vi.fn() },
			gatewayClient: { guilds: { resolveKey: (id: string) => id, cache: { get: async (id: string) => (joined.has(id) ? { id } : undefined) } } }
		});
	});

	test('GIVEN a honeypot of a guild the bot left THEN it is not touched, Discord would refuse every request', async () => {
		joined = new Set();
		vi.mocked(fetchHoneypotChannels).mockResolvedValue([{ guildId, channelId, warning: true, action: 'Softban' }]);
		vi.mocked(readHoneypotNotices).mockResolvedValue(new Map([[other, { channelId: '9', messageId: '1', action: 'Ban' }]]));

		await reconcileHoneypotNotices();

		expect(readSettings).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(removeHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN warnings out of step after the connection was down THEN each is put in order, the others are left alone', async () => {
		vi.mocked(fetchHoneypotChannels).mockResolvedValue([
			{ guildId, channelId, warning: true, action: 'Softban' },
			{ guildId: '242043489611808769', channelId: '3', warning: true, action: 'Kick' }
		]);
		vi.mocked(readHoneypotNotices).mockResolvedValue(
			new Map([
				[other, { channelId: '9', messageId: '1', action: 'Ban' }],
				['242043489611808769', { channelId: '3', messageId: '2', action: 'Kick' }]
			])
		);
		vi.mocked(readSettings).mockImplementation(
			async (id) => ({ ...getDefaultGuildSettings()!, id, honeypotChannel: id === guildId ? channelId : null }) as never
		);

		await reconcileHoneypotNotices();

		expect(refreshHoneypotNotice).toHaveBeenCalledExactlyOnceWith(guildId, channelId, expect.anything());
		expect(removeHoneypotNotice).toHaveBeenCalledExactlyOnceWith(other);
	});
});
