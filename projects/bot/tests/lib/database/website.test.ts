import { DatabaseNotificationChannels, type NotificationClient } from '#lib/database/notifications';
import { parseDashboardSettingsUpdate } from '#lib/database/settings/dashboard';
import { createLocalWebsiteTarget, createShardManagerWebsiteTarget, createWebsiteListener } from '#lib/database/website';
import { onShardMessage } from '#lib/sharder/messages';
import { container } from '@wolfstar/http-framework';
import { EventEmitter } from 'node:events';

const guildId = '254360814063058944';

class FakeClient extends EventEmitter implements NotificationClient {
	public async connect() {}
	public async query() {}
	public async end() {}
}

describe('parseDashboardSettingsUpdate', () => {
	test('GIVEN a write THEN it has the guild and its keys, once each', () => {
		expect(parseDashboardSettingsUpdate(JSON.stringify({ guildId, keys: ['honeypotChannel', 'honeypotChannel', 'logsWebhooks'] }))).toEqual({
			guildId,
			keys: ['honeypotChannel', 'logsWebhooks']
		});
	});

	test.each([
		['not JSON', 'honeypotChannel'],
		['not an object', '"x"'],
		['no guild', JSON.stringify({ keys: ['a'] })],
		['a guild that is no snowflake', JSON.stringify({ guildId: '12', keys: ['a'] })],
		['keys that are no list', JSON.stringify({ guildId, keys: 'a' })],
		['a key that is no text', JSON.stringify({ guildId, keys: ['a', 3] })],
		['an empty key', JSON.stringify({ guildId, keys: [''] })]
	])('GIVEN %s THEN it is not a write', (_, payload) => {
		expect(parseDashboardSettingsUpdate(payload)).toBeNull();
	});
});

describe('createWebsiteListener', () => {
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	const target = { settingsUpdate: vi.fn(), invalidateAllSettings: vi.fn(), joinGuardRequest: vi.fn() };

	beforeEach(() => vi.clearAllMocks());

	async function listen() {
		const client = new FakeClient();
		const listener = createWebsiteListener(target, { createClient: () => client, logger });
		listener.start();
		await new Promise((resolve) => setImmediate(resolve));
		return { client, listener };
	}

	test('GIVEN the connection listens THEN every cached copy of the settings goes, what was written meanwhile is lost', async () => {
		const { listener } = await listen();

		expect(target.invalidateAllSettings).toHaveBeenCalledTimes(1);
		await listener.stop();
	});

	test('GIVEN a write of the dashboard THEN the target is told, and a payload that is not one is only logged', async () => {
		const { client, listener } = await listen();

		client.emit('notification', {
			channel: DatabaseNotificationChannels.GuildSettingsUpdate,
			payload: JSON.stringify({ guildId, keys: ['honeypotWarning'] })
		});
		client.emit('notification', { channel: DatabaseNotificationChannels.GuildSettingsUpdate, payload: '{"guildId":1}' });

		expect(target.settingsUpdate).toHaveBeenCalledTimes(1);
		expect(target.settingsUpdate).toHaveBeenCalledWith({ guildId, keys: ['honeypotWarning'] });
		expect(logger.warn).toHaveBeenCalledTimes(1);
		await listener.stop();
	});

	test('GIVEN a request of the join guard THEN the target is told its ID', async () => {
		const { client, listener } = await listen();

		client.emit('notification', { channel: DatabaseNotificationChannels.JoinGuardRequest, payload: ' 42 ' });

		expect(target.joinGuardRequest).toHaveBeenCalledWith('42');
		await listener.stop();
	});
});

describe('targets', () => {
	test('GIVEN the shard manager THEN the writes go to every shard, and the requests of the join guard to the first one', async () => {
		const manager = { broadcast: vi.fn(async () => undefined), send: vi.fn(async () => undefined) };
		const target = createShardManagerWebsiteTarget(manager, { info: vi.fn(), warn: vi.fn(), error: vi.fn() });

		target.settingsUpdate({ guildId, keys: ['logsWebhooks'] });
		target.invalidateAllSettings();
		target.joinGuardRequest('42');

		expect(manager.broadcast).toHaveBeenCalledWith({ type: 'settingsUpdate', guildId, keys: ['logsWebhooks'] });
		expect(manager.broadcast).toHaveBeenCalledWith({ type: 'settingsInvalidateAll' });
		expect(manager.send).toHaveBeenCalledWith(0, { type: 'joinGuardRequest', requestId: '42' });
	});

	test('GIVEN one process THEN the writes are handled here as a shard would, and the requests are queued', () => {
		Object.assign(container, { client: { emit: vi.fn() }, shard: null });
		const updates = vi.fn();
		const invalidations = vi.fn();
		onShardMessage('settingsUpdate', updates);
		onShardMessage('settingsInvalidateAll', invalidations);
		const enqueue = vi.fn();
		const target = createLocalWebsiteTarget(enqueue);

		target.settingsUpdate({ guildId, keys: ['logsWebhooks'] });
		target.invalidateAllSettings();
		target.joinGuardRequest('42');

		expect(updates).toHaveBeenCalledWith({ type: 'settingsUpdate', guildId, keys: ['logsWebhooks'] });
		expect(invalidations).toHaveBeenCalledTimes(1);
		expect(enqueue).toHaveBeenCalledWith('42');
	});
});
