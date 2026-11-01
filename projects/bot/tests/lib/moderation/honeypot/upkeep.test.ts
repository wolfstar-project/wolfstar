import { writeSettingsTransaction } from '#lib/database';
import { refreshHoneypotNotice, removeHoneypotNotice, withHoneypotLock } from '#lib/moderation/honeypot/channel';
import { getHoneypotUpkeepHour, HoneypotChannelNames, pickHoneypotChannelName, runHoneypotUpkeep } from '#lib/moderation/honeypot/upkeep';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type GuildData } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ writeSettingsTransaction: vi.fn() }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	refreshHoneypotNotice: vi.fn(async () => true),
	removeHoneypotNotice: vi.fn(),
	renderHoneypotNotice: vi.fn(() => ({ content: 'notice' })),
	withHoneypotLock: vi.fn()
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const replacementId = '254360814063058948';
const botId = '266624760782258186';

// What the task read, a moment before the upkeep of this guild runs:
const upkeep = { guildId, channelId };

function createError(code: number, message: string) {
	return new DiscordAPIError({ code, message }, code, 404, 'GET', 'https://discord.com', {});
}

describe('getHoneypotUpkeepHour', () => {
	test('GIVEN a guild THEN its hour is one of the day, and always the same', () => {
		const hour = getHoneypotUpkeepHour(guildId);

		expect(hour).toBeGreaterThanOrEqual(0);
		expect(hour).toBeLessThan(24);
		expect(getHoneypotUpkeepHour(guildId)).toBe(hour);
	});

	test('GIVEN guilds created at different times THEN they are spread over the day', () => {
		// The timestamp of a snowflake starts at its 23rd bit, so these are 24 guilds created a millisecond apart:
		const hours = Array.from({ length: 24 }, (_, index) => getHoneypotUpkeepHour(String(BigInt(index) << 22n)));

		expect(new Set(hours).size).toBe(24);
	});
});

describe('pickHoneypotChannelName', () => {
	test('GIVEN the name the channel has THEN another one is picked, whatever the draw', () => {
		for (const current of HoneypotChannelNames) {
			for (const random of [0, 0.5, 0.999_999]) {
				const name = pickHoneypotChannelName(current, random);

				expect(name).not.toBe(current);
				expect(HoneypotChannelNames).toContain(name);
			}
		}
	});

	test('GIVEN a name of the server THEN any of the names can be picked', () => {
		expect(pickHoneypotChannelName('rules', 0)).toBe(HoneypotChannelNames[0]);
		expect(pickHoneypotChannelName(null, 0.999_999)).toBe(HoneypotChannelNames.at(-1));
	});

	test('GIVEN the names THEN none gives the trap away nor invites the members to write', () => {
		for (const name of ['honeypot', 'general-chat', 'introductions', 'new-members', 'lounge', 'share-your-work', 'trading', 'off-topic']) {
			expect(HoneypotChannelNames).not.toContain(name);
		}
	});

	test('GIVEN the names THEN each is one Discord takes for a text channel', () => {
		for (const name of HoneypotChannelNames) expect(name).toMatch(/^[a-z-]{1,100}$/);
		expect(new Set(HoneypotChannelNames).size).toBe(HoneypotChannelNames.length);
	});
});

describe('runHoneypotUpkeep', () => {
	const fetch = vi.fn();
	const edit = vi.fn(async () => ({}));
	const createMessage = vi.fn();
	const deleteMessage = vi.fn(async () => undefined);
	// What the database has for the guild, which is not always what the task read:
	let settings: GuildData;
	const audits: string[] = [];

	function setSettings(overrides: Partial<GuildData> = {}) {
		settings = { ...getDefaultGuildSettings()!, id: guildId, honeypotChannel: channelId, ...overrides } as GuildData;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		audits.length = 0;
		setSettings();
		fetch.mockResolvedValue({ id: channelId, guildId, name: 'giveaways' });
		createMessage.mockResolvedValue({ id: '99' });
		vi.mocked(refreshHoneypotNotice).mockResolvedValue(true);
		vi.mocked(withHoneypotLock).mockImplementation((_guildId, callback) => callback());
		vi.mocked(writeSettingsTransaction).mockImplementation(async () => {
			const changes: Partial<GuildData> = {};
			const trx = {
				settings,
				write: (data: Partial<GuildData>) => {
					Object.assign(changes, data);
					return trx;
				},
				submitWithAudit: async (actorId: string) => {
					Object.assign(settings, changes);
					audits.push(actorId);
				},
				[Symbol.dispose]: () => undefined
			};
			return trx as never;
		});
		Object.assign(container, {
			gatewayClient: {
				user: { id: botId },
				channels: { fetch },
				messages: { delete: deleteMessage },
				api: { channels: { edit, createMessage } }
			}
		});
	});

	test('GIVEN a channel that is renamed THEN it gets a name it did not have, and no message, under the lock', async () => {
		setSettings({ honeypotRandomName: true });

		expect(await runHoneypotUpkeep(upkeep)).toBe('done');

		expect(withHoneypotLock).toHaveBeenCalledWith(guildId, expect.any(Function));
		expect(edit).toHaveBeenCalledTimes(1);
		expect(edit).toHaveBeenCalledWith(channelId, { name: expect.not.stringMatching(/^giveaways$/) }, { reason: 'Honeypot' });
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a channel that is kept active with a warning THEN the warning is sent again', async () => {
		setSettings({ honeypotKeepActive: true, honeypotAction: 'Ban' });

		expect(await runHoneypotUpkeep(upkeep)).toBe('done');

		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, channelId, { warning: true, action: 'Ban' });
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a warning that cannot be sent again THEN the upkeep says it failed', async () => {
		setSettings({ honeypotKeepActive: true });
		vi.mocked(refreshHoneypotNotice).mockResolvedValue(false);

		expect(await runHoneypotUpkeep(upkeep)).toBe('failed');
	});

	test('GIVEN a channel that is kept active without a warning THEN a message is sent and deleted at once', async () => {
		setSettings({ honeypotKeepActive: true, honeypotWarning: false });

		expect(await runHoneypotUpkeep(upkeep)).toBe('done');

		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(createMessage).toHaveBeenCalledWith(channelId, { content: 'notice' });
		expect(deleteMessage).toHaveBeenCalledWith(channelId, '99', 'Honeypot');
	});

	test('GIVEN a channel without a warning the bot cannot write in THEN the upkeep says it failed', async () => {
		setSettings({ honeypotKeepActive: true, honeypotWarning: false });
		createMessage.mockRejectedValue(createError(50013, 'Missing Permissions'));

		expect(await runHoneypotUpkeep(upkeep)).toBe('failed');
		expect(deleteMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a channel the bot cannot rename THEN it is still kept active', async () => {
		setSettings({ honeypotRandomName: true, honeypotKeepActive: true });
		edit.mockRejectedValueOnce(createError(50013, 'Missing Permissions'));

		expect(await runHoneypotUpkeep(upkeep)).toBe('done');
		expect(refreshHoneypotNotice).toHaveBeenCalledTimes(1);
	});

	test('GIVEN a channel that was deleted THEN the honeypot is turned off, its warning forgotten and nothing else is done', async () => {
		setSettings({ honeypotRandomName: true, honeypotKeepActive: true });
		fetch.mockRejectedValue(createError(10003, 'Unknown Channel'));

		expect(await runHoneypotUpkeep(upkeep)).toBe('gone');

		expect(settings.honeypotChannel).toBeNull();
		expect(audits).toEqual([botId]);
		expect(removeHoneypotNotice).toHaveBeenCalledWith(guildId);
		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN a channel of another guild THEN it is not touched', async () => {
		setSettings({ honeypotRandomName: true });
		fetch.mockResolvedValue({ id: channelId, guildId: '1', name: 'giveaways' });

		expect(await runHoneypotUpkeep(upkeep)).toBe('gone');
		expect(edit).not.toHaveBeenCalled();
	});

	test('GIVEN a deleted channel that was replaced while the upkeep ran THEN the new honeypot is kept', async () => {
		setSettings({ honeypotRandomName: true });
		// The administrator sets the honeypot up again while Discord is asked about the channel that is gone:
		fetch.mockImplementation(async () => {
			settings.honeypotChannel = replacementId;
			throw createError(10003, 'Unknown Channel');
		});

		expect(await runHoneypotUpkeep(upkeep)).toBe('skipped');

		expect(settings.honeypotChannel).toBe(replacementId);
		expect(audits).toEqual([]);
		expect(removeHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN a honeypot that was disabled after the task read it THEN its old channel is left alone', async () => {
		setSettings({ honeypotChannel: null, honeypotRandomName: true, honeypotKeepActive: true });

		expect(await runHoneypotUpkeep(upkeep)).toBe('skipped');

		expect(fetch).not.toHaveBeenCalled();
		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a honeypot that moved after the task read it THEN its old channel is left alone', async () => {
		setSettings({ honeypotChannel: replacementId, honeypotRandomName: true, honeypotKeepActive: true });

		expect(await runHoneypotUpkeep(upkeep)).toBe('skipped');

		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN the honeypot module off THEN the channel is not renamed nor written in', async () => {
		setSettings({ modulesHoneypot: false, honeypotRandomName: true, honeypotKeepActive: true });

		expect(await runHoneypotUpkeep(upkeep)).toBe('skipped');

		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN the honeypot module off and a channel that was deleted THEN the honeypot keeps its settings', async () => {
		setSettings({ modulesHoneypot: false, honeypotRandomName: true });
		fetch.mockRejectedValue(createError(10003, 'Unknown Channel'));

		expect(await runHoneypotUpkeep(upkeep)).toBe('skipped');

		expect(settings.honeypotChannel).toBe(channelId);
		expect(audits).toEqual([]);
		expect(removeHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN switches that were turned off after the task read them THEN nothing is done', async () => {
		expect(await runHoneypotUpkeep(upkeep)).toBe('skipped');

		expect(fetch).not.toHaveBeenCalled();
		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});
});
