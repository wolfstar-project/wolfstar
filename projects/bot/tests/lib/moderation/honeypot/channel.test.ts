import {
	deleteHoneypotChannel,
	getMissingHoneypotGuildPermissions,
	getMissingHoneypotLogPermissions,
	getMissingHoneypotPermissions,
	readHoneypotNotice,
	refreshHoneypotNotice,
	removeHoneypotNotice,
	renderHoneypotNotice
} from '#lib/moderation/honeypot/channel';
import { renderHoneypotSummary } from '#lib/moderation/honeypot/commands';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import { ComponentType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => t) }));
vi.mock('@wolfstar/plugin-gateway', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-gateway')>()),
	computePermissionsIn: vi.fn()
}));

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

/** A Redis that only knows what the warnings use of it: the fields of a hash. */
function createRedis() {
	const store = new Map<string, string>();
	return {
		store,
		status: 'ready',
		hget: vi.fn(async (_hash: string, field: string) => store.get(field) ?? null),
		hset: vi.fn(async (_hash: string, field: string, value: string) => store.set(field, value).size),
		hdel: vi.fn(async (_hash: string, field: string) => Number(store.delete(field)))
	};
}

function createError(code: number, message: string) {
	return new DiscordAPIError({ code, message }, code, 403, 'POST', 'https://discord.com', {});
}

describe('the warning of the honeypot', () => {
	const list = vi.fn();
	const deleteMessage = vi.fn(async (_channelId: string, _messageId: string) => undefined);
	const createMessage = vi.fn();
	const original = container.redis;
	let redis: ReturnType<typeof createRedis>;

	beforeEach(() => {
		vi.clearAllMocks();
		createMessage.mockResolvedValue({ id: '20' });
		redis = createRedis();
		Object.assign(container, {
			redis,
			gatewayClient: { user: { id: botId }, messages: { list, delete: deleteMessage }, api: { channels: { createMessage } } }
		});
	});

	afterAll(() => {
		container.redis = original;
	});

	describe('refreshHoneypotNotice', () => {
		test('GIVEN a honeypot without a warning yet THEN one is sent and remembered, and nothing is deleted', async () => {
			expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Softban' })).toBe(true);

			expect(createMessage).toHaveBeenCalledWith(channelId, renderHoneypotNotice(t, 'Softban'));
			expect(deleteMessage).not.toHaveBeenCalled();
			expect(redis.hset).toHaveBeenCalledWith('wolfstar:honeypot:notices', guildId, `${channelId}:20:Softban`);
			expect(await readHoneypotNotice(guildId)).toEqual({ channelId, messageId: '20', action: 'Softban' });
		});

		test('GIVEN a channel with other messages of the bot THEN only the warning is replaced, and the channel is never read', async () => {
			redis.store.set(guildId, `${channelId}:10`);

			expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Ban' })).toBe(true);

			expect(list).not.toHaveBeenCalled();
			expect(deleteMessage.mock.calls).toEqual([[channelId, '10', 'Honeypot']]);
			expect(await readHoneypotNotice(guildId)).toEqual({ channelId, messageId: '20', action: 'Ban' });
		});

		test('GIVEN a warning THEN the new one is sent before the old one is deleted', async () => {
			redis.store.set(guildId, `${channelId}:10`);

			await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Ban' });

			expect(createMessage.mock.invocationCallOrder[0]).toBeLessThan(deleteMessage.mock.invocationCallOrder[0]);
		});

		test('GIVEN a channel the bot cannot write in anymore THEN the warning it had stays, and it says the new one is not there', async () => {
			redis.store.set(guildId, `${channelId}:10`);
			createMessage.mockRejectedValue(createError(50013, 'Missing Permissions'));

			expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Kick' })).toBe(false);

			expect(deleteMessage).not.toHaveBeenCalled();
			expect(await readHoneypotNotice(guildId)).toEqual({ channelId, messageId: '10', action: null });
		});

		test('GIVEN a honeypot that moved THEN the warning of the channel it left is deleted', async () => {
			redis.store.set(guildId, `${logChannelId}:10`);

			expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Softban' })).toBe(true);

			expect(deleteMessage.mock.calls).toEqual([[logChannelId, '10', 'Honeypot']]);
			expect(await readHoneypotNotice(guildId)).toEqual({ channelId, messageId: '20', action: 'Softban' });
		});

		test('GIVEN a honeypot that moved to a channel the bot cannot write in THEN the channel it left still loses its warning', async () => {
			redis.store.set(guildId, `${logChannelId}:10`);
			createMessage.mockRejectedValue(createError(50013, 'Missing Permissions'));

			expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Softban' })).toBe(false);

			expect(deleteMessage.mock.calls).toEqual([[logChannelId, '10', 'Honeypot']]);
			expect(await readHoneypotNotice(guildId)).toBeNull();
		});

		test('GIVEN a server without a warning THEN the one it had is removed and nothing is sent', async () => {
			redis.store.set(guildId, `${channelId}:10`);

			expect(await refreshHoneypotNotice(guildId, channelId, { warning: false, action: 'Softban' })).toBe(true);

			expect(deleteMessage.mock.calls).toEqual([[channelId, '10', 'Honeypot']]);
			expect(createMessage).not.toHaveBeenCalled();
			expect(await readHoneypotNotice(guildId)).toBeNull();
		});

		test('GIVEN a warning somebody deleted THEN it is replaced all the same', async () => {
			redis.store.set(guildId, `${channelId}:10`);
			deleteMessage.mockRejectedValueOnce(createError(10008, 'Unknown Message'));

			expect(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: 'Kick' })).toBe(true);
			expect(await readHoneypotNotice(guildId)).toEqual({ channelId, messageId: '20', action: 'Kick' });
		});
	});

	describe('removeHoneypotNotice', () => {
		test('GIVEN a warning THEN it is deleted and forgotten', async () => {
			redis.store.set(guildId, `${channelId}:10`);

			await removeHoneypotNotice(guildId);

			expect(deleteMessage.mock.calls).toEqual([[channelId, '10', 'Honeypot']]);
			expect(redis.hdel).toHaveBeenCalledWith('wolfstar:honeypot:notices', guildId);
		});

		test('GIVEN no warning THEN nothing is deleted', async () => {
			await removeHoneypotNotice(guildId);

			expect(deleteMessage).not.toHaveBeenCalled();
		});
	});

	describe('without Redis', () => {
		test('GIVEN a warning this process sent THEN it is the one replaced and removed', async () => {
			Object.assign(container, { redis: undefined });
			const otherGuildId = '254360814063058999';

			await refreshHoneypotNotice(otherGuildId, channelId, { warning: true, action: 'Kick' });
			expect(await readHoneypotNotice(otherGuildId)).toEqual({ channelId, messageId: '20', action: 'Kick' });

			createMessage.mockResolvedValue({ id: '21' });
			await refreshHoneypotNotice(otherGuildId, channelId, { warning: true, action: 'Ban' });
			expect(deleteMessage.mock.calls).toEqual([[channelId, '20', 'Honeypot']]);

			await removeHoneypotNotice(otherGuildId);
			expect(deleteMessage).toHaveBeenLastCalledWith(channelId, '21', 'Honeypot');
			expect(await readHoneypotNotice(otherGuildId)).toBeNull();
		});
	});
});

describe('the permissions of the honeypot', () => {
	const fetch = vi.fn();
	const fetchPermissions = vi.fn();
	const fetchMe = vi.fn(async () => ({ id: botId, fetchPermissions }));
	const deleteChannel = vi.fn();

	function grant(...names: (keyof typeof PermissionFlagsBits)[]) {
		const bits = names.reduce((all, name) => all | PermissionFlagsBits[name], 0n);
		const permissions = { has: (bit: bigint) => (bits & bit) === bit };
		fetchPermissions.mockResolvedValue(permissions);
		vi.mocked(computePermissionsIn).mockResolvedValue(permissions as never);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		fetch.mockResolvedValue({ id: channelId, guildId });
		Object.assign(container, { gatewayClient: { channels: { fetch }, members: { fetchMe }, api: { channels: { delete: deleteChannel } } } });
	});

	test('GIVEN a guild where the bot cannot ban THEN a softban cannot run in a channel it would create', async () => {
		grant('ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages', 'ManageChannels', 'KickMembers');

		expect(await getMissingHoneypotGuildPermissions(guildId, 'Softban')).toEqual(['BanMembers']);
		expect(await getMissingHoneypotGuildPermissions(guildId, 'Kick')).toEqual([]);
		// The answer is the one of the guild, there is no channel to ask about yet:
		expect(fetch).not.toHaveBeenCalled();
	});

	test('GIVEN a channel THEN the honeypot needs to read, write and delete in it, and the permission of its action', async () => {
		grant('ViewChannel', 'SendMessages');

		expect(await getMissingHoneypotPermissions(guildId, channelId, 'Ban')).toEqual(['ReadMessageHistory', 'ManageMessages', 'BanMembers']);
	});

	test('GIVEN a logs channel the bot cannot post in THEN what it lacks is named', async () => {
		grant('ViewChannel');
		expect(await getMissingHoneypotLogPermissions(guildId, logChannelId)).toEqual(['SendMessages', 'EmbedLinks']);

		grant('ViewChannel', 'SendMessages', 'EmbedLinks');
		expect(await getMissingHoneypotLogPermissions(guildId, logChannelId)).toEqual([]);
	});

	test('GIVEN a channel of another guild, or one that is gone THEN there is no answer', async () => {
		grant('ViewChannel', 'SendMessages', 'EmbedLinks');

		fetch.mockResolvedValue({ id: logChannelId, guildId: '1' });
		expect(await getMissingHoneypotLogPermissions(guildId, logChannelId)).toBeNull();

		fetch.mockRejectedValue(createError(10003, 'Unknown Channel'));
		expect(await getMissingHoneypotPermissions(guildId, channelId, 'Kick')).toBeNull();
	});

	test('GIVEN a channel that was just created THEN it can be deleted, and one that is already gone is not an error', async () => {
		deleteChannel.mockResolvedValueOnce({});
		await deleteHoneypotChannel(channelId);
		expect(deleteChannel).toHaveBeenCalledWith(channelId, { reason: 'Honeypot' });

		deleteChannel.mockRejectedValueOnce(createError(10003, 'Unknown Channel'));
		await expect(deleteHoneypotChannel(channelId)).resolves.toBeUndefined();
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
