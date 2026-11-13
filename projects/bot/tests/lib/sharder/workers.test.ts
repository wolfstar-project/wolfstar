import { broadcastShardMessage, onShardMessage, setShardMessageRelay, type ShardMessage } from '#lib/sharder/messages';
import {
	parseRelayedShardMessage,
	shouldHandleRelayedShardMessage,
	startWorkerMessageRelay,
	WorkerMessagesChannel,
	type RelayedShardMessage
} from '#lib/sharder/workers';
import { container } from '@wolfstar/http-framework';
import { EventEmitter } from 'node:events';

const guildId = '254360814063058944';

describe('the messages of the workers of the broker', () => {
	describe('parseRelayedShardMessage', () => {
		const relayed = (message: unknown) => JSON.stringify({ origin: 'a', worker: true, message });

		test('GIVEN a message that drops a cache THEN it is read', () => {
			expect(parseRelayedShardMessage(relayed({ type: 'automodRulesUpdate', guildId }))).toEqual({
				origin: 'a',
				worker: true,
				message: { type: 'automodRulesUpdate', guildId }
			});
		});

		test('GIVEN a request of the website, or what is not a message THEN it is refused', () => {
			expect(parseRelayedShardMessage(relayed({ type: 'appealRequest', requestId: '1' }))).toBeNull();
			expect(parseRelayedShardMessage(relayed({ type: 'unknown' }))).toBeNull();
			expect(parseRelayedShardMessage('{')).toBeNull();
			expect(parseRelayedShardMessage(JSON.stringify({ origin: 'a', message: { type: 'settingsUpdate', guildId } }))).toBeNull();
		});
	});

	describe('shouldHandleRelayedShardMessage', () => {
		const message: ShardMessage = { type: 'settingsUpdate', guildId };
		const from = (origin: string, worker: boolean): RelayedShardMessage => ({ origin, worker, message });

		test('GIVEN a worker THEN it handles what every other process sends, not its own', () => {
			const self = { origin: 'w1', worker: true };
			expect(shouldHandleRelayedShardMessage(from('gateway', false), self)).toBe(true);
			expect(shouldHandleRelayedShardMessage(from('w2', true), self)).toBe(true);
			expect(shouldHandleRelayedShardMessage(from('w1', true), self)).toBe(false);
		});

		test('GIVEN the gateway THEN it handles what the workers send alone, the shards told it already', () => {
			const self = { origin: 'g1', worker: false };
			expect(shouldHandleRelayedShardMessage(from('w1', true), self)).toBe(true);
			expect(shouldHandleRelayedShardMessage(from('g2', false), self)).toBe(false);
		});
	});

	describe('startWorkerMessageRelay', () => {
		const original = { redis: container.redis, shard: container.shard };
		const publish = vi.fn();
		let subscriber: EventEmitter & { subscribe: ReturnType<typeof vi.fn> };

		beforeEach(() => {
			publish.mockReset().mockResolvedValue(1);
			subscriber = Object.assign(new EventEmitter(), { subscribe: vi.fn().mockResolvedValue(1) });
			Object.assign(container, { redis: { publish, duplicate: () => subscriber }, shard: null });
		});

		afterEach(() => {
			setShardMessageRelay(null);
			vi.unstubAllEnvs();
			Object.assign(container, original);
		});

		test('GIVEN the broker off THEN nothing is relayed', async () => {
			await startWorkerMessageRelay();

			broadcastShardMessage({ type: 'cleanupUpdate', guildId });
			expect(publish).not.toHaveBeenCalled();
		});

		test('GIVEN a worker THEN it tells what it changes, and handles what the gateway changed', async () => {
			vi.stubEnv('BOT_MODE', 'worker');
			const handler = vi.fn();
			onShardMessage('roleRulesUpdate', handler);
			await startWorkerMessageRelay();
			expect(subscriber.subscribe).toHaveBeenCalledWith(WorkerMessagesChannel);

			broadcastShardMessage({ type: 'cleanupUpdate', guildId });
			const sent = JSON.parse(publish.mock.calls[0][1]) as RelayedShardMessage;
			expect(sent).toMatchObject({ worker: true, message: { type: 'cleanupUpdate', guildId } });

			subscriber.emit(
				'message',
				WorkerMessagesChannel,
				JSON.stringify({ origin: 'gateway', worker: false, message: { type: 'roleRulesUpdate', guildId } })
			);
			subscriber.emit('message', WorkerMessagesChannel, JSON.stringify({ ...sent, message: { type: 'roleRulesUpdate', guildId } }));
			expect(handler).toHaveBeenCalledOnce();
		});

		test('GIVEN the channel connected again THEN every cached copy is dropped', async () => {
			vi.stubEnv('BOT_MODE', 'worker');
			const handler = vi.fn();
			onShardMessage('settingsInvalidateAll', handler);
			await startWorkerMessageRelay();

			subscriber.emit('ready');
			expect(handler).not.toHaveBeenCalled();
			subscriber.emit('ready');
			expect(handler).toHaveBeenCalledOnce();
		});
	});
});
