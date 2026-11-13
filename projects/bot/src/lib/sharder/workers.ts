import { dispatchShardMessage, onShardMessage, setShardMessageRelay, type ShardMessage, type ShardMessageType } from '#lib/sharder/messages';
import { forwardsDispatches, isWorker } from '#utils/worker';
import { container } from '@wolfstar/http-framework';
import { randomUUID } from 'node:crypto';

/**
 * The Redis channel the gateway and the workers of the broker tell each other what changed on.
 */
export const WorkerMessagesChannel = 'wolfstar:shard-messages';

/**
 * The messages that drop a cache, which a worker keeps as a shard does. The requests of the website are not among
 * them: the gateway handles those.
 */
const RelayedTypes: ReadonlySet<ShardMessageType> = new Set<ShardMessageType>([
	'settingsUpdate',
	'settingsInvalidateAll',
	'automodRulesUpdate',
	'cleanupUpdate',
	'moderationReasonsUpdate',
	'warnThresholdsUpdate',
	'roleRulesUpdate',
	'joinGuardUpdate'
]);

/**
 * A message on {@linkcode WorkerMessagesChannel}: who sent it, so a process does not handle its own, and whether a
 * worker did.
 */
export interface RelayedShardMessage {
	origin: string;
	worker: boolean;
	message: ShardMessage;
}

/**
 * Reads a message of {@linkcode WorkerMessagesChannel}.
 *
 * @returns The message, `null` when it is not one, or not one that is relayed.
 */
export function parseRelayedShardMessage(raw: string): RelayedShardMessage | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof value !== 'object' || value === null) return null;
	const { origin, worker, message } = value as Record<string, unknown>;
	if (typeof origin !== 'string' || typeof worker !== 'boolean' || typeof message !== 'object' || message === null) return null;

	const { type } = message as { type?: unknown };
	if (typeof type !== 'string' || !RelayedTypes.has(type as ShardMessageType)) return null;
	return { origin, worker, message: message as ShardMessage };
}

/**
 * Which messages of {@linkcode WorkerMessagesChannel} a process handles: a worker, the ones of every other process; a
 * process of the gateway, the ones of the workers alone, since the other shards told it already.
 *
 * @param relayed - The message.
 * @param self - The origin of this process, and whether it is a worker.
 */
export function shouldHandleRelayedShardMessage(relayed: RelayedShardMessage, self: { origin: string; worker: boolean }): boolean {
	if (relayed.origin === self.origin) return false;
	return self.worker || relayed.worker;
}

/**
 * Carries what changed between the gateway and the workers of the broker, which are no shards and do not hear the
 * website, so a worker does not keep acting on the settings or the rules it cached before they changed. Does nothing
 * when the broker is off.
 *
 * @remarks
 *
 * The messages go through Redis pub/sub, which keeps nothing for a subscriber that was disconnected: when it connects
 * again, the process drops every cached copy, as the shards do when the connection that hears the website comes back.
 * The gateway passes on the writes of the dashboard too, from the process that hears them: the only one, or the first
 * shard, which the shard manager tells.
 */
export async function startWorkerMessageRelay() {
	const worker = isWorker();
	if (!worker && !forwardsDispatches()) return;

	const origin = randomUUID();
	const self = { origin, worker };
	const publish = (message: ShardMessage) => {
		if (!RelayedTypes.has(message.type)) return;
		const body: RelayedShardMessage = { origin, worker, message };
		void container.redis
			.publish(WorkerMessagesChannel, JSON.stringify(body))
			.catch((error: unknown) => container.logger.error(`[Broker] Could not tell the workers about ${message.type}:`, error));
	};
	setShardMessageRelay(publish);

	const shard = container.shard ?? null;
	if (!worker && (shard === null || shard.id === 0)) {
		// Only a write of the dashboard has keys, and only the connection that hears it invalidates them all:
		onShardMessage('settingsUpdate', (message) => {
			if (message.keys !== undefined) publish(message);
		});
		onShardMessage('settingsInvalidateAll', (message) => publish(message));
	}

	const subscriber = container.redis.duplicate();
	subscriber.on('message', (channel: string, raw: string) => {
		if (channel !== WorkerMessagesChannel) return;
		const relayed = parseRelayedShardMessage(raw);
		if (relayed === null || !shouldHandleRelayedShardMessage(relayed, self)) return;
		dispatchShardMessage(relayed.message);
	});

	let connected = false;
	subscriber.on('ready', () => {
		if (connected) {
			container.logger.warn('[Broker] The channel of the workers connected again, every cached copy is dropped.');
			dispatchShardMessage({ type: 'settingsInvalidateAll' });
		}
		connected = true;
	});
	subscriber.on('error', (error: unknown) => container.logger.error('[Broker] The channel of the workers failed:', error));

	await subscriber.subscribe(WorkerMessagesChannel);
	container.logger.debug(`[Startup] The ${worker ? 'worker' : 'gateway'} listens to ${WorkerMessagesChannel}`);
}
