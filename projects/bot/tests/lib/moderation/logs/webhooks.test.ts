import {
	canSendThroughWebhook,
	deleteLogWebhooks,
	findOwnedLogWebhook,
	getLogWebhookChannels,
	getUnusedLogWebhookChannels,
	isWebhookLogKey,
	readLogWebhook,
	resolveLogWebhook,
	sendThroughLogWebhook,
	WebhookLogKeys
} from '#lib/moderation/logs/webhooks';
import { getConfigurableKeys } from '#lib/database/settings/configuration';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import { MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('@wolfstar/plugin-gateway', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-gateway')>()),
	computePermissionsIn: vi.fn()
}));

const guildId = '254360814063058944';
const applicationId = process.env.CLIENT_ID;
const token = 'a-token-nobody-should-read';
const hash = 'wolfstar:logs:webhooks';

// A channel that could not get a webhook is left alone for a while by the process, so every test has its own:
let lastChannelId = 254360814063058950n;
function nextChannelId() {
	return String(++lastChannelId);
}

function createSettings(overrides: Partial<ReadonlyGuildData> = {}) {
	return { ...getDefaultGuildSettings()!, id: guildId, ...overrides } as ReadonlyGuildData;
}

/** A Redis that only knows what the webhooks and their lock use of it. */
function createRedis() {
	const store = new Map<string, string>();
	const locks = new Map<string, string>();
	return {
		store,
		status: 'ready',
		hget: vi.fn(async (_hash: string, field: string) => store.get(field) ?? null),
		hset: vi.fn(async (_hash: string, field: string, value: string) => store.set(field, value).size),
		hdel: vi.fn(async (_hash: string, field: string) => Number(store.delete(field))),
		set: vi.fn(async (key: string, value: string) => {
			if (locks.has(key)) return null;
			locks.set(key, value);
			return 'OK';
		}),
		eval: vi.fn(async (_script: string, _keys: number, key: string) => Number(locks.delete(key)))
	};
}

function createError(code: number, status: number) {
	return new DiscordAPIError({ code, message: 'Refused' }, code, status, 'POST', `https://discord.com/api/webhooks/1/${token}`, {});
}

function mockPermissions(bits: bigint) {
	vi.mocked(computePermissionsIn).mockResolvedValue({ has: (bit: bigint) => (bits & bit) === bit } as never);
}

const message = { components: [], flags: MessageFlags.IsComponentsV2, allowed_mentions: { parse: [] } };

describe('the keys of the logs a webhook sends', () => {
	test('GIVEN the settings THEN every log channel is one, and the honeypot log', () => {
		const logChannels = [...getConfigurableKeys().values()]
			.filter((key) => key.name.startsWith('logs.') && key.type === 'guildTextChannel' && !key.array)
			.map((key) => key.property);

		// A new log has to be looked at: it goes through a webhook only when nothing edits its message afterwards.
		expect([...WebhookLogKeys].sort()).toEqual([...logChannels, 'honeypotLogChannel'].sort());
	});

	test('GIVEN the moderation log or the reports THEN they stay messages of the bot', () => {
		expect(isWebhookLogKey('moderationChannel')).toBe(false);
		expect(isWebhookLogKey('reportsChannel')).toBe(false);
		expect(isWebhookLogKey('logsMemberAdd')).toBe(true);
	});
});

describe('canSendThroughWebhook', () => {
	test('GIVEN a message of components or embeds THEN a webhook can send it', () => {
		expect(canSendThroughWebhook(message)).toBe(true);
		expect(canSendThroughWebhook({ embeds: [{ description: 'A log' }] })).toBe(true);
	});

	test('GIVEN a forward, a reply or a sticker THEN it cannot', () => {
		expect(canSendThroughWebhook({ forward: { message: '1', channel: '2' } })).toBe(false);
		expect(canSendThroughWebhook({ reply: { messageReference: '1' } })).toBe(false);
		expect(canSendThroughWebhook({ message_reference: { message_id: '1' } })).toBe(false);
		expect(canSendThroughWebhook({ stickers: ['1'] })).toBe(false);
	});
});

describe('getLogWebhookChannels', () => {
	test('GIVEN the webhooks turned off THEN no channel has one', () => {
		expect(getLogWebhookChannels(createSettings({ logsMemberAdd: '1' })).size).toBe(0);
	});

	test('GIVEN the webhooks turned on THEN the channels of the logs have one, not the moderation log nor the reports', () => {
		const settings = createSettings({
			logsWebhooks: true,
			logsMemberAdd: '1',
			logsMemberRemove: '1',
			honeypotLogChannel: '2',
			moderationChannel: '3',
			reportsChannel: '4'
		});

		expect([...getLogWebhookChannels(settings)]).toEqual(['1', '2']);
	});
});

describe('getUnusedLogWebhookChannels', () => {
	test('GIVEN a log that moved while another one stays THEN the webhook of the old channel is left alone', () => {
		const before = getLogWebhookChannels(createSettings({ logsWebhooks: true, logsMemberAdd: '1', logsMemberRemove: '1' }));
		const after = getLogWebhookChannels(createSettings({ logsWebhooks: true, logsMemberAdd: '2', logsMemberRemove: '1' }));

		expect(getUnusedLogWebhookChannels(before, after)).toEqual([]);
	});

	test('GIVEN the last log of a channel that moved THEN its webhook is not used anymore', () => {
		const before = getLogWebhookChannels(createSettings({ logsWebhooks: true, logsMemberAdd: '1', logsMemberRemove: '2' }));
		const after = getLogWebhookChannels(createSettings({ logsWebhooks: true, logsMemberAdd: '2', logsMemberRemove: '2' }));

		expect(getUnusedLogWebhookChannels(before, after)).toEqual(['1']);
	});

	test('GIVEN the webhooks turned off THEN none is used anymore', () => {
		const before = getLogWebhookChannels(createSettings({ logsWebhooks: true, logsMemberAdd: '1', logsMemberRemove: '2' }));
		const after = getLogWebhookChannels(createSettings({ logsMemberAdd: '1', logsMemberRemove: '2' }));

		expect(getUnusedLogWebhookChannels(before, after)).toEqual(['1', '2']);
	});
});

describe('findOwnedLogWebhook', () => {
	test('GIVEN the webhooks of a channel THEN the one of the bot is picked', () => {
		const webhooks = [
			{ id: '1', token: 'of-a-user', applicationId: null },
			{ id: '2', token: null, applicationId: '999' },
			{ id: '3', token, applicationId: '10' }
		];

		expect(findOwnedLogWebhook(webhooks, '10')).toEqual({ id: '3', token });
	});

	test('GIVEN no webhook of the bot, or one without a token THEN there is none', () => {
		expect(findOwnedLogWebhook([{ id: '1', token: 'of-a-user', applicationId: null }], '10')).toBeNull();
		expect(findOwnedLogWebhook([{ id: '2', applicationId: '10' }], '10')).toBeNull();
		expect(findOwnedLogWebhook([], '10')).toBeNull();
	});
});

describe('the webhook of a log channel', () => {
	const fetchChannel = vi.fn();
	const create = vi.fn();
	const send = vi.fn();
	const remove = vi.fn();
	const warn = vi.fn();
	const original = { redis: container.redis, gatewayClient: container.gatewayClient, logger: container.logger };
	let redis: ReturnType<typeof createRedis>;
	let channelId: string;

	beforeEach(() => {
		vi.resetAllMocks();
		mockPermissions(PermissionFlagsBits.ManageWebhooks);
		fetchChannel.mockResolvedValue([]);
		create.mockResolvedValue({ id: '100', token });
		send.mockResolvedValue({ id: '1' });
		remove.mockResolvedValue(undefined);
		redis = createRedis();
		channelId = nextChannelId();
		Object.assign(container, {
			redis,
			logger: { warn, error: vi.fn() },
			gatewayClient: {
				user: { username: 'WolfStar', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/a.png' },
				members: { fetchMe: vi.fn(async () => ({ id: '266624760782258186' })) },
				webhooks: { fetchChannel, create, send, delete: remove }
			}
		});
	});

	afterAll(() => {
		Object.assign(container, original);
	});

	describe('resolveLogWebhook', () => {
		test('GIVEN a channel with no webhook THEN one is created, named after the bot, and remembered', async () => {
			expect(await resolveLogWebhook(guildId, channelId)).toEqual({ id: '100', token });

			expect(create).toHaveBeenCalledWith(channelId, expect.objectContaining({ name: 'WolfStar' }));
			expect(redis.hset).toHaveBeenCalledWith(hash, channelId, `100:${token}`);
			expect(await readLogWebhook(channelId)).toEqual({ id: '100', token });
		});

		test('GIVEN a remembered webhook THEN it is used, and Discord is not asked', async () => {
			redis.store.set(channelId, `50:${token}`);
			mockPermissions(0n);

			expect(await resolveLogWebhook(guildId, channelId)).toEqual({ id: '50', token });
			expect(fetchChannel).not.toHaveBeenCalled();
			expect(create).not.toHaveBeenCalled();
		});

		test('GIVEN a lost record and a webhook the bot owns in the channel THEN it is found again, and none is created', async () => {
			fetchChannel.mockResolvedValue([
				{ id: '7', token: 'of-a-user', applicationId: null },
				{ id: '60', token, applicationId }
			]);

			expect(await resolveLogWebhook(guildId, channelId)).toEqual({ id: '60', token });
			expect(create).not.toHaveBeenCalled();
			expect(await readLogWebhook(channelId)).toEqual({ id: '60', token });
		});

		test('GIVEN no Manage Webhooks in the channel THEN there is no webhook, and Discord is not asked', async () => {
			mockPermissions(PermissionFlagsBits.SendMessages);

			expect(await resolveLogWebhook(guildId, channelId)).toBeNull();
			expect(fetchChannel).not.toHaveBeenCalled();
			expect(create).not.toHaveBeenCalled();
		});

		test('GIVEN two logs at once THEN the second one uses the webhook the first one made', async () => {
			const webhooks = await Promise.all([resolveLogWebhook(guildId, channelId), resolveLogWebhook(guildId, channelId)]);

			expect(webhooks).toEqual([
				{ id: '100', token },
				{ id: '100', token }
			]);
			expect(create).toHaveBeenCalledTimes(1);
		});

		test('GIVEN a channel that is full of webhooks THEN there is none, and it is not tried again at once', async () => {
			create.mockRejectedValue(createError(30007, 400));

			expect(await resolveLogWebhook(guildId, channelId)).toBeNull();
			expect(await resolveLogWebhook(guildId, channelId)).toBeNull();
			expect(create).toHaveBeenCalledTimes(1);
			expect(fetchChannel).toHaveBeenCalledTimes(1);
		});

		test('GIVEN Redis that cannot be asked THEN the process remembers the webhook itself', async () => {
			container.redis = null as never;

			expect(await resolveLogWebhook(guildId, channelId)).toEqual({ id: '100', token });
			expect(await resolveLogWebhook(guildId, channelId)).toEqual({ id: '100', token });
			expect(create).toHaveBeenCalledTimes(1);
		});
	});

	describe('sendThroughLogWebhook', () => {
		test('GIVEN a log THEN it is sent through the webhook as it is, mentions included', async () => {
			redis.store.set(channelId, `50:${token}`);
			const embeds = { embeds: [{ description: 'A log' }], allowed_mentions: { parse: [] } };

			expect(await sendThroughLogWebhook(guildId, channelId, embeds)).toBe(true);
			expect(send).toHaveBeenCalledWith('50', token, embeds);
		});

		test('GIVEN a log made of components THEN the webhook is asked to send them', async () => {
			redis.store.set(channelId, `50:${token}`);
			const components = { ...message, components: [{ type: 10, content: 'A log' }] };

			expect(await sendThroughLogWebhook(guildId, channelId, components as never)).toBe(true);
			expect(send).toHaveBeenCalledWith('50', token, { ...components, withComponents: true });
		});

		test('GIVEN a webhook that was deleted THEN it is forgotten, created again and the log is sent once more', async () => {
			redis.store.set(channelId, `50:${token}`);
			send.mockRejectedValueOnce(createError(10015, 404));

			expect(await sendThroughLogWebhook(guildId, channelId, message)).toBe(true);
			expect(send.mock.calls.map(([id]) => id)).toEqual(['50', '100']);
			expect(await readLogWebhook(channelId)).toEqual({ id: '100', token });
		});

		test('GIVEN a webhook that is unknown twice THEN it is not tried a third time', async () => {
			redis.store.set(channelId, `50:${token}`);
			send.mockRejectedValue(createError(10015, 404));

			expect(await sendThroughLogWebhook(guildId, channelId, message)).toBe(false);
			expect(send).toHaveBeenCalledTimes(2);
		});

		test('GIVEN a deleted webhook and no permission to make another THEN the log is left to a regular message', async () => {
			redis.store.set(channelId, `50:${token}`);
			send.mockRejectedValueOnce(createError(10015, 404));
			mockPermissions(0n);

			expect(await sendThroughLogWebhook(guildId, channelId, message)).toBe(false);
			expect(send).toHaveBeenCalledTimes(1);
			expect(await readLogWebhook(channelId)).toBeNull();
		});

		test('GIVEN any other failure THEN it is not retried, the webhook is kept and its token is not logged', async () => {
			redis.store.set(channelId, `50:${token}`);
			send.mockRejectedValue(createError(50013, 403));

			expect(await sendThroughLogWebhook(guildId, channelId, message)).toBe(false);
			expect(send).toHaveBeenCalledTimes(1);
			expect(await readLogWebhook(channelId)).toEqual({ id: '50', token });
			expect(warn).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
		});

		test('GIVEN a failure that is not of Discord THEN it is a regular message too', async () => {
			redis.store.set(channelId, `50:${token}`);
			send.mockRejectedValue(new Error(`fetch failed for /webhooks/50/${token}`));

			expect(await sendThroughLogWebhook(guildId, channelId, message)).toBe(false);
			expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
		});
	});

	describe('deleteLogWebhooks', () => {
		test('GIVEN a channel no log uses THEN its webhook is deleted with its token and forgotten', async () => {
			redis.store.set(channelId, `50:${token}`);

			await deleteLogWebhooks([channelId]);

			expect(remove).toHaveBeenCalledWith('50', expect.objectContaining({ token }));
			expect(await readLogWebhook(channelId)).toBeNull();
		});

		test('GIVEN a channel with no remembered webhook THEN nothing is deleted', async () => {
			await deleteLogWebhooks([channelId]);

			expect(remove).not.toHaveBeenCalled();
		});

		test('GIVEN a webhook Discord does not delete THEN it is forgotten all the same, and the others are deleted', async () => {
			const other = nextChannelId();
			redis.store.set(channelId, `50:${token}`);
			redis.store.set(other, `51:${token}`);
			remove.mockRejectedValueOnce(createError(50013, 403));

			await deleteLogWebhooks([channelId, other]);

			expect(remove).toHaveBeenCalledTimes(2);
			expect(redis.store.size).toBe(0);
			expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
		});
	});
});
