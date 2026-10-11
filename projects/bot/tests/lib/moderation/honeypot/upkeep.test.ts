import { writeSettings } from '#lib/database';
import { refreshHoneypotNotice } from '#lib/moderation/honeypot/channel';
import { getHoneypotUpkeepHour, HoneypotChannelNames, pickHoneypotChannelName, runHoneypotUpkeep } from '#lib/moderation/honeypot/upkeep';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { HoneypotUpkeep } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ writeSettings: vi.fn() }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/honeypot/channel', () => ({
	refreshHoneypotNotice: vi.fn(async () => true),
	renderHoneypotNotice: vi.fn(() => ({ content: 'notice' }))
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const botId = '266624760782258186';

function createUpkeep(overrides: Partial<HoneypotUpkeep> = {}): HoneypotUpkeep {
	return { guildId, channelId, action: 'Softban', warning: true, randomName: false, keepActive: false, ...overrides };
}

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

	beforeEach(() => {
		vi.clearAllMocks();
		fetch.mockResolvedValue({ id: channelId, guildId, name: 'honeypot' });
		createMessage.mockResolvedValue({ id: '99' });
		Object.assign(container, {
			gatewayClient: {
				user: { id: botId },
				channels: { fetch },
				messages: { delete: deleteMessage },
				api: { channels: { edit, createMessage } }
			}
		});
	});

	test('GIVEN a channel that is renamed THEN it gets a name it did not have, and no message', async () => {
		expect(await runHoneypotUpkeep(createUpkeep({ randomName: true }))).toBe('done');

		expect(edit).toHaveBeenCalledTimes(1);
		expect(edit).toHaveBeenCalledWith(channelId, { name: expect.not.stringMatching(/^honeypot$/) }, { reason: 'Honeypot' });
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a channel that is kept active with a warning THEN the warning is sent again', async () => {
		const upkeep = createUpkeep({ keepActive: true });

		expect(await runHoneypotUpkeep(upkeep)).toBe('done');

		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).toHaveBeenCalledWith(guildId, channelId, upkeep);
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a channel that is kept active without a warning THEN a message is sent and deleted at once', async () => {
		expect(await runHoneypotUpkeep(createUpkeep({ keepActive: true, warning: false }))).toBe('done');

		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
		expect(createMessage).toHaveBeenCalledWith(channelId, { content: 'notice' });
		expect(deleteMessage).toHaveBeenCalledWith(channelId, '99', 'Honeypot');
	});

	test('GIVEN a channel the bot cannot rename THEN it is still kept active', async () => {
		edit.mockRejectedValueOnce(createError(50013, 'Missing Permissions'));

		expect(await runHoneypotUpkeep(createUpkeep({ randomName: true, keepActive: true }))).toBe('done');
		expect(refreshHoneypotNotice).toHaveBeenCalledTimes(1);
	});

	test('GIVEN a channel that was deleted THEN the honeypot is turned off and nothing else is done', async () => {
		fetch.mockRejectedValue(createError(10003, 'Unknown Channel'));

		expect(await runHoneypotUpkeep(createUpkeep({ randomName: true, keepActive: true }))).toBe('gone');

		expect(writeSettings).toHaveBeenCalledWith(guildId, { honeypotChannel: null }, botId);
		expect(edit).not.toHaveBeenCalled();
		expect(refreshHoneypotNotice).not.toHaveBeenCalled();
	});

	test('GIVEN a channel of another guild THEN it is not touched', async () => {
		fetch.mockResolvedValue({ id: channelId, guildId: '1', name: 'honeypot' });

		expect(await runHoneypotUpkeep(createUpkeep({ randomName: true }))).toBe('gone');
		expect(edit).not.toHaveBeenCalled();
	});
});
