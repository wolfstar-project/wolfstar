import { refreshHoneypotNotice, renderHoneypotNotice } from '#lib/moderation/honeypot/channel';
import { renderHoneypotSummary } from '#lib/moderation/honeypot/commands';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => t) }));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const logChannelId = '254360814063058947';
const botId = '266624760782258186';

function createSettings(overrides: Partial<ReadonlyGuildData> = {}) {
	return { ...getDefaultGuildSettings()!, id: guildId, ...overrides } as ReadonlyGuildData;
}

describe('renderHoneypotNotice', () => {
	test('GIVEN an action THEN the warning tells what happens to who writes, and mentions nobody', () => {
		const notice = renderHoneypotNotice(t, 'Ban');

		expect(notice.flags).toBe(MessageFlags.IsComponentsV2);
		expect(notice.allowed_mentions).toEqual({ parse: [] });
		expect(notice.components[0].type).toBe(ComponentType.Container);
		expect(notice.components[0].components[0].content).toContain('"consequence":"commands/honeypot:noticeBan"');
	});

	test.each(['Kick', 'Softban', 'Ban'] as const)('GIVEN %s THEN the warning has a text of its own', (action) => {
		expect(renderHoneypotNotice(t, action).components[0].components[0].content).toContain(`commands/honeypot:notice${action}`);
	});
});

describe('refreshHoneypotNotice', () => {
	const list = vi.fn();
	const deleteMessage = vi.fn(async (_channelId: string, _messageId: string) => undefined);
	const createMessage = vi.fn(async () => ({ id: '1' }));

	beforeEach(() => {
		vi.clearAllMocks();
		createMessage.mockResolvedValue({ id: '1' });
		list.mockResolvedValue([
			{ id: '10', author: { id: botId } },
			{ id: '11', author: { id: '242043489611808769' } },
			{ id: '12', author: { id: botId } }
		]);
		Object.assign(container, {
			gatewayClient: { user: { id: botId }, messages: { list, delete: deleteMessage }, api: { channels: { createMessage } } }
		});
	});

	test('GIVEN a channel with old warnings THEN only the messages of the bot are replaced by a new one', async () => {
		expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Softban' })).toBe(true);

		expect(deleteMessage.mock.calls.map(([, id]) => id)).toEqual(['10', '12']);
		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(createMessage).toHaveBeenCalledWith(channelId, renderHoneypotNotice(t, 'Softban'));
	});

	test('GIVEN a server without a warning THEN the old ones are removed and nothing is sent', async () => {
		expect(await refreshHoneypotNotice(guildId, channelId, { warning: false, action: 'Softban' })).toBe(true);

		expect(deleteMessage).toHaveBeenCalledTimes(2);
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a channel the bot cannot write in THEN it says the warning is not there', async () => {
		createMessage.mockRejectedValue(
			new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'POST', 'https://discord.com', {})
		);

		expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Kick' })).toBe(false);
	});

	test('GIVEN a channel the bot cannot read THEN the warning is still sent', async () => {
		list.mockRejectedValue(new DiscordAPIError({ code: 50001, message: 'Missing Access' }, 50001, 403, 'GET', 'https://discord.com', {}));

		expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Kick' })).toBe(true);
		expect(deleteMessage).not.toHaveBeenCalled();
	});
});

describe('renderHoneypotSummary', () => {
	test('GIVEN a server without a honeypot THEN it says how to set one up', () => {
		const embed = renderHoneypotSummary(t, createSettings()).toJSON();

		expect(embed.title).toBe('commands/honeypot:showTitle');
		expect(embed.description).toBe('commands/honeypot:showOff {"command":"`/honeypot setup`"}');
	});

	test('GIVEN a honeypot THEN every setting is listed with the name the settings menu gives it', () => {
		const settings = createSettings({
			honeypotChannel: channelId,
			honeypotLogChannel: logChannelId,
			honeypotAction: 'Ban',
			honeypotRandomName: true
		});
		const lines = renderHoneypotSummary(t, settings).toJSON().description!.split('\n');

		expect(lines).toEqual([
			`commands/honeypot:showLine {"name":"settings:names.honeypotChannel","value":"<#${channelId}>"}`,
			'commands/honeypot:showLine {"name":"settings:names.honeypotAction","value":"serializers:honeypotActionBan"}',
			`commands/honeypot:showLine {"name":"settings:names.honeypotLogChannel","value":"<#${logChannelId}>"}`,
			'commands/honeypot:showLine {"name":"settings:names.honeypotDirectMessage","value":"arguments:booleanEnabled"}',
			'commands/honeypot:showLine {"name":"settings:names.honeypotWarning","value":"arguments:booleanEnabled"}',
			'commands/honeypot:showLine {"name":"settings:names.honeypotRandomName","value":"arguments:booleanEnabled"}',
			'commands/honeypot:showLine {"name":"settings:names.honeypotKeepActive","value":"arguments:booleanDisabled"}'
		]);
	});

	test('GIVEN a honeypot that reports nowhere THEN its logs are none', () => {
		const description = renderHoneypotSummary(t, createSettings({ honeypotChannel: channelId })).toJSON().description!;

		expect(description).toContain('{"name":"settings:names.honeypotLogChannel","value":"commands/honeypot:showNone"}');
	});
});
