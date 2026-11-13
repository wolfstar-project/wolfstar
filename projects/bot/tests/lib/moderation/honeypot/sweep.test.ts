import { sweepHoneypotMessages } from '#lib/moderation/honeypot/sweep';
import { readSettings } from '#lib/database';
import { collectMemberMessages } from '#lib/moderation/histories';
import { bulkDeleteChannelMessages } from '#lib/moderation/cleanup/messages';
import { getDefaultGuildSettings } from 'wolfstar-database';
import { container } from '@wolfstar/http-framework';

vi.mock('#common', () => ({ resolveGuild: vi.fn(async () => ({ id: '1' })) }));
vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));
vi.mock('#lib/moderation/histories', () => ({ collectMemberMessages: vi.fn() }));
vi.mock('#lib/moderation/cleanup/messages', () => ({ bulkDeleteChannelMessages: vi.fn(async () => 1) }));

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings(), modulesHoneypot: true, honeypotEnsureDeletion: true } as never);
	Object.assign(container, { logger: { debug: vi.fn(), error: vi.fn() } });
});

test('a delayed sweep preserves messages older than the window chosen when caught', async () => {
	const caughtAt = 1_000_000;
	vi.mocked(collectMemberMessages).mockResolvedValue([
		{ id: 'old', channelId: '2', createdAt: caughtAt - 901_000 },
		{ id: 'recent', channelId: '2', createdAt: caughtAt - 899_000 }
	] as never);
	expect(await sweepHoneypotMessages({ guildId: '1', userId: '3', caughtAt, deleteSeconds: 900 })).toBe(1);
	expect(bulkDeleteChannelMessages).toHaveBeenCalledWith('1', '2', [expect.objectContaining({ id: 'recent' })]);
});

test('an old job without a deletion window leaves history alone', async () => {
	expect(await sweepHoneypotMessages({ guildId: '1', userId: '3' } as never)).toBe(0);
	expect(bulkDeleteChannelMessages).not.toHaveBeenCalled();
});
