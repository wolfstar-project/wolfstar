import { syncUpdatesChannelFollow } from '#utils/updates';
import { container } from '@sapphire/framework';
import { WebhookType, Routes } from 'discord-api-types/v10';

beforeEach(() => {
	vi.stubEnv('UPDATES_ANNOUNCEMENT_CHANNEL_ID', '123');
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

it('follows the announcements when selecting a new channel', async () => {
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([]);
	const post = vi.spyOn(container.client.rest, 'post').mockResolvedValue({});
	await syncUpdatesChannelFollow(null, '456');
	expect(post).toHaveBeenCalledWith(Routes.channelFollowers('123'), expect.objectContaining({ body: { webhook_channel_id: '456' } }));
});

it('keeps an existing announcement follower without creating a duplicate', async () => {
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([{ id: '789', type: WebhookType.ChannelFollower, source_channel: { id: '123' } }]);
	const post = vi.spyOn(container.client.rest, 'post').mockResolvedValue({});
	await syncUpdatesChannelFollow(null, '456');
	expect(post).not.toHaveBeenCalled();
});

it('reset removes only followers of the configured WolfStar announcement source', async () => {
	vi.spyOn(container.client.rest, 'get').mockResolvedValue([
		{ id: '789', type: WebhookType.ChannelFollower, source_channel: { id: '123' } },
		{ id: '999', type: WebhookType.ChannelFollower, source_channel: { id: '111' } },
		{ id: '888', type: WebhookType.Incoming }
	]);
	const remove = vi.spyOn(container.client.rest, 'delete').mockResolvedValue({});
	await syncUpdatesChannelFollow('456', null);
	expect(remove.mock.calls.map(([route]) => route)).toEqual([Routes.webhook('789')]);
});
