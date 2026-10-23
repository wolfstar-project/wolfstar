import { syncUpdatesChannelFollow } from '#utils/updates';
import { container } from '@wolfstar/http-framework';
import { WebhookType } from 'discord-api-types/v10';

const previousChannel = '111111111111111111';
const nextChannel = '222222222222222222';
// Not the default of the schema, so the tests show the channel is read from the environment:
const announcementChannel = '333333333333333333';

const getWebhooks = vi.fn();
const followAnnouncements = vi.fn();
const deleteWebhook = vi.fn();

function follower(id: string, sourceId = announcementChannel) {
	return { id, type: WebhookType.ChannelFollower, source_channel: { id: sourceId } };
}

describe('syncUpdatesChannelFollow', () => {
	const original = container.gatewayClient;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('UPDATES_ANNOUNCEMENT_CHANNEL_ID', announcementChannel);
		getWebhooks.mockResolvedValue([]);
		Object.assign(container, {
			gatewayClient: { api: { channels: { getWebhooks, followAnnouncements }, webhooks: { delete: deleteWebhook } } }
		});
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		Object.assign(container, { gatewayClient: original });
	});

	test('GIVEN a channel that is set THEN it follows the announcements of the support server', async () => {
		await syncUpdatesChannelFollow(null, nextChannel);

		expect(followAnnouncements).toHaveBeenCalledWith(announcementChannel, nextChannel, expect.anything());
		expect(deleteWebhook).not.toHaveBeenCalled();
	});

	test('GIVEN a channel that already follows them THEN it is not given a second follow', async () => {
		getWebhooks.mockResolvedValue([follower('3')]);

		await syncUpdatesChannelFollow(null, nextChannel);

		expect(followAnnouncements).not.toHaveBeenCalled();
	});

	test('GIVEN a channel that changes THEN the previous one stops following, and only the updates are unfollowed', async () => {
		getWebhooks.mockImplementation(async (channelId: string) =>
			channelId === previousChannel ? [follower('3'), follower('4', '999999999999999999'), { id: '5', type: WebhookType.Incoming }] : []
		);

		await syncUpdatesChannelFollow(previousChannel, nextChannel);

		expect(deleteWebhook).toHaveBeenCalledTimes(1);
		expect(deleteWebhook).toHaveBeenCalledWith('3', expect.anything());
		expect(followAnnouncements).toHaveBeenCalledWith(announcementChannel, nextChannel, expect.anything());
	});

	test('GIVEN the same channel THEN nothing is asked to Discord', async () => {
		await syncUpdatesChannelFollow(nextChannel, nextChannel);

		expect(getWebhooks).not.toHaveBeenCalled();
	});

	test('GIVEN a follow Discord refuses THEN it is logged and does not throw', async () => {
		followAnnouncements.mockRejectedValue(new Error('Missing Permissions'));
		const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);

		await expect(syncUpdatesChannelFollow(null, nextChannel)).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
