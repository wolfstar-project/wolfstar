import { sendLogMessage } from '#lib/moderation/logs/send';
import { readSettings } from '#lib/database/settings/functions';
import { sendThroughLogWebhook } from '#lib/moderation/logs/webhooks';
import { ChannelType } from 'discord-api-types/v10';

vi.mock('#lib/database/settings/functions', () => ({ readSettings: vi.fn() }));
vi.mock('#lib/moderation/logs/webhooks', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/logs/webhooks')>()),
	sendThroughLogWebhook: vi.fn()
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const message = { embeds: [{ description: 'A log' }] };

function createChannel(type: ChannelType = ChannelType.GuildText) {
	return { id: channelId, guildId, type, send: vi.fn(async () => ({ id: '1' })) };
}

function mockSettings(logsWebhooks: boolean) {
	vi.mocked(readSettings).mockResolvedValue({ logsWebhooks } as never);
}

describe('sendLogMessage', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockSettings(true);
		vi.mocked(sendThroughLogWebhook).mockResolvedValue(true);
	});

	test('GIVEN the webhooks turned on THEN the log goes through the webhook, and the bot sends nothing', async () => {
		const channel = createChannel();

		await sendLogMessage(channel as never, 'logsMemberAdd', message);

		expect(sendThroughLogWebhook).toHaveBeenCalledWith(guildId, channelId, message, undefined);
		expect(channel.send).not.toHaveBeenCalled();
	});

	test('GIVEN the webhooks turned off, as they are by default THEN the log is a regular message', async () => {
		mockSettings(false);
		const channel = createChannel();

		await sendLogMessage(channel as never, 'logsMemberAdd', message);

		expect(sendThroughLogWebhook).not.toHaveBeenCalled();
		expect(channel.send).toHaveBeenCalledWith(message);
	});

	test('GIVEN a webhook that could not send THEN the log is sent as a regular message, so it is not lost', async () => {
		vi.mocked(sendThroughLogWebhook).mockResolvedValue(false);
		const channel = createChannel();

		await sendLogMessage(channel as never, 'logsMemberAdd', message);

		expect(channel.send).toHaveBeenCalledWith(message);
	});

	test.each(['moderationChannel', 'reportsChannel'])('GIVEN %s THEN it stays a regular message of the bot', async (key) => {
		const channel = createChannel();

		await sendLogMessage(channel as never, key, message);

		expect(sendThroughLogWebhook).not.toHaveBeenCalled();
		expect(channel.send).toHaveBeenCalledWith(message);
	});

	test('GIVEN a forward, which a webhook cannot send THEN it is a regular message', async () => {
		const channel = createChannel();
		const forward = { forward: { message: '1', channel: '2' } };

		await sendLogMessage(channel as never, 'logsImage', forward);

		expect(sendThroughLogWebhook).not.toHaveBeenCalled();
		expect(channel.send).toHaveBeenCalledWith(forward);
	});

	test('GIVEN a thread THEN the log goes through the webhook of its parent, posted in the thread', async () => {
		const channel = { ...createChannel(ChannelType.PublicThread), parentId: '254360814063058999' };

		await sendLogMessage(channel as never, 'logsMemberAdd', message);

		expect(sendThroughLogWebhook).toHaveBeenCalledWith(guildId, '254360814063058999', message, channelId);
		expect(channel.send).not.toHaveBeenCalled();
	});

	test('GIVEN a thread whose webhook cannot send THEN the log is sent to the thread by the bot', async () => {
		vi.mocked(sendThroughLogWebhook).mockResolvedValue(false);
		const channel = { ...createChannel(ChannelType.PublicThread), parentId: '254360814063058999' };

		await sendLogMessage(channel as never, 'logsMemberAdd', message);

		expect(channel.send).toHaveBeenCalledWith(message);
	});

	test('GIVEN a channel that is not text THEN it is a regular message', async () => {
		const channel = createChannel(ChannelType.GuildForum);

		await sendLogMessage(channel as never, 'logsMemberAdd', message);

		expect(sendThroughLogWebhook).not.toHaveBeenCalled();
		expect(channel.send).toHaveBeenCalledWith(message);
	});
});
