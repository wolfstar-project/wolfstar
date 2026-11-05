import { reconcileUpdatesChannelFollows, syncUpdatesChannelFollow } from '#utils/updates';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import { container } from '@sapphire/framework';
import { WebhookType, Routes } from 'discord-api-types/v10';

const botId = '100';

beforeEach(() => {
	vi.stubEnv('UPDATES_ANNOUNCEMENT_CHANNEL_ID', '123');
	vi.spyOn(container.client, 'id', 'get').mockReturnValue(botId);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

function follower(id: string, sourceChannelId: string, creatorId = botId) {
	return { id, type: WebhookType.ChannelFollower, source_channel: { id: sourceChannelId }, user: { id: creatorId } };
}

it('follows the announcements when selecting a new channel', async () => {
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([]);
	const post = vi.spyOn(container.client.rest, 'post').mockResolvedValue({});
	await syncUpdatesChannelFollow('1', null, '456');
	expect(post).toHaveBeenCalledWith(Routes.channelFollowers('123'), expect.objectContaining({ body: { webhook_channel_id: '456' } }));
});

it('keeps an existing announcement follower without creating a duplicate', async () => {
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([follower('789', '123', '999')]);
	const post = vi.spyOn(container.client.rest, 'post').mockResolvedValue({});
	await syncUpdatesChannelFollow('1', null, '456');
	expect(post).not.toHaveBeenCalled();
});

it('reset removes only the follower WolfStar made of its announcement channel', async () => {
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([
		follower('789', '123'),
		follower('777', '123', '999'),
		follower('555', '111'),
		{ id: '888', type: WebhookType.Incoming, user: { id: botId } }
	]);
	const remove = vi.spyOn(container.client.rest, 'delete').mockResolvedValue({});
	await syncUpdatesChannelFollow('1', '456', null);
	expect(remove.mock.calls.map(([route]) => route)).toEqual([Routes.webhook('789')]);
});

it('runs the follows of a server one after the other', async () => {
	// The webhooks of each channel, as Discord holds them while the follows run:
	const webhooks = new Map<string, ReturnType<typeof follower>[]>([['A', [follower('w0', '123')]]]);
	let created = 0;
	vi.spyOn(container.client.rest, 'get').mockImplementation(async (route) => {
		const channelId = String(route).split('/')[2];
		await Promise.resolve();
		return [...(webhooks.get(channelId) ?? [])];
	});
	vi.spyOn(container.client.rest, 'post').mockImplementation(async (_route, options) => {
		const { webhook_channel_id: channelId } = options!.body as { webhook_channel_id: string };
		webhooks.set(channelId, [...(webhooks.get(channelId) ?? []), follower(`w${++created}`, '123')]);
		return {};
	});
	vi.spyOn(container.client.rest, 'delete').mockImplementation(async (route) => {
		const webhookId = String(route).split('/')[2];
		for (const [channelId, list] of webhooks)
			webhooks.set(
				channelId,
				list.filter((webhook) => webhook.id !== webhookId)
			);
		return {};
	});

	await Promise.all([syncUpdatesChannelFollow('1', 'A', 'B'), syncUpdatesChannelFollow('1', 'B', 'A')]);
	expect(webhooks.get('A')).toHaveLength(1);
	expect(webhooks.get('B')).toHaveLength(0);
});

/** The servers listed with an updates channel, with the one each of them has when its follow runs. */
function mockServers(channels: Record<string, string | null>, present: string[] = Object.keys(channels)) {
	vi.spyOn(container.prisma.guild, 'findMany').mockResolvedValue(Object.keys(channels).map((id) => ({ id })) as never);
	vi.spyOn(container.prisma.guild, 'findUnique').mockImplementation((async ({ where }: { where: { id: string } }) => ({
		...getDefaultGuildSettings(),
		id: where.id,
		channelsUpdates: channels[where.id]
	})) as never);
	vi.spyOn(container.client.guilds.cache, 'has').mockImplementation((id) => present.includes(id));
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([]);
	return vi.spyOn(container.client.rest, 'post').mockResolvedValue({});
}

it('makes the updates channels the servers already have follow the announcements, once the bot is ready', async () => {
	// The bot is no longer in the second server:
	const post = mockServers({ '1001': '456', '1002': '789' }, ['1001']);

	await reconcileUpdatesChannelFollows();
	expect(post.mock.calls.map(([, options]) => options?.body)).toEqual([{ webhook_channel_id: '456' }]);
});

it('follows the channel a server has when its turn comes, not the one it had when the servers were listed', async () => {
	// The first server moved its updates to another channel after the list was read, the second one reset it:
	const post = mockServers({ '1003': '999', '1004': null });

	await reconcileUpdatesChannelFollows();
	expect(post.mock.calls.map(([, options]) => options?.body)).toEqual([{ webhook_channel_id: '999' }]);
});
