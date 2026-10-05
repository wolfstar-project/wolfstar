import { envParseBoolean, envParseInteger, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import type { GatewayClient } from '@wolfstar/plugin-gateway';
import { ShardClient, ShardManager } from '@wolfstar/plugin-sharder';
import { isWorker } from '#utils/worker';
import { bold, magenta } from 'colorette';

const header = bold(magenta('[SHARDER]'));

/**
 * Whether this process is the shard manager: with `SHARDER_ENABLED`, the process that is started spawns the shards
 * (`node:cluster` workers running this same script) and never connects to Discord itself.
 */
export const isShardManager = () => envParseBoolean('SHARDER_ENABLED', false) && ShardClient.context === null && !isWorker();

/**
 * Spawns the shards and supervises them, see `@wolfstar/plugin-sharder`.
 *
 * @remarks
 *
 * The gateway shards are Discord's recommended count, split across `SHARDER_CLUSTERS` processes (one per CPU core by
 * default). The shards are cluster workers, so they share the ports of the interactions endpoint and of the API, and
 * the manager balances the connections between them.
 */
export async function startShardManager() {
	const clusters = envParseInteger('SHARDER_CLUSTERS', 0);
	const manager = new ShardManager({
		strategy: 'cluster',
		token: envParseString('DISCORD_TOKEN'),
		totalShards: 'auto',
		shards: 'auto',
		clusters: clusters > 0 ? clusters : undefined,
		// The manager paces the identifies of every process (`ShardClient#identifyThrottler`), so nothing to wait for:
		spawn: { delay: 0 }
	});

	manager
		.on('shardCreate', (channel) => console.log(`${header} Shard ${channel.id} spawned`))
		.on('shardReady', (channel) => console.log(`${header} Shard ${channel.id} ready, gateway shards ${channel.shards.join(', ')}`))
		.on('shardDisconnect', (channel) => console.warn(`${header} Shard ${channel.id} disconnected`))
		.on('shardReconnecting', (channel) => console.warn(`${header} Shard ${channel.id} reconnecting`))
		.on('shardRestart', (channel) => console.warn(`${header} Shard ${channel.id} restarting`))
		.on('shardExit', (channel, code) => console.warn(`${header} Shard ${channel.id} exited with code ${code}`))
		.on('shardError', (channel, error) => console.error(`${header} Shard ${channel.id} failed before it was ready`, error))
		.on('shardGiveUp', (channel, crashes) => console.error(`${header} Shard ${channel.id} given up on after ${crashes} crashes`))
		.on('error', (error) => console.error(`${header}`, error));

	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => void manager.destroy().finally(() => process.exit(0)));
	}

	await manager.spawn();
	return manager;
}

/**
 * Creates the shard's side of the sharder when a manager spawned this process, and sets `container.shard`.
 *
 * @returns The shard, `null` when the bot runs in a single process.
 */
export function createShardClient(): ShardClient | null {
	const shard = ShardClient.context === null ? null : new ShardClient();
	container.shard = shard;
	if (shard === null) return null;

	shard.on('message', (body: ShardMessage, from) => {
		// A message sent to every shard comes back to the one that sent it:
		if (from === shard.id) return;
		for (const handler of handlers.get(body?.type) ?? []) handler(body);
	});

	return shard;
}

/**
 * Binds a gateway client to its shard: the manager's `GET /gateway/bot` is reused, the shard is ready once all of its
 * gateway shards are, and the manager closing the shard disconnects them.
 *
 * @param shard - The shard of this process.
 * @param client - The client that connects the gateway shards of {@linkcode shard}.
 */
export function bindShardClient(shard: ShardClient, client: GatewayClient) {
	client.gateway.fetchGatewayInformation = () => shard.fetchGatewayInformation();

	const pending = new Set(shard.shards);
	client.on('shardReady', (shardId) => {
		if (pending.delete(shardId) && pending.size === 0) void shard.ready();
	});

	shard.setCloseHandler(() => client.destroy());
}

/**
 * The messages the shards send each other, by their `type`.
 */
export interface ShardMessages {
	/**
	 * The settings of a guild were written by a shard, the others drop their cached copy.
	 */
	settingsUpdate: { guildId: string };
}

export type ShardMessageType = keyof ShardMessages;
export type ShardMessage<Type extends ShardMessageType = ShardMessageType> = { [Key in Type]: { type: Key } & ShardMessages[Key] }[Type];

type ShardMessageHandler = (message: ShardMessage) => void;
const handlers = new Map<ShardMessageType, ShardMessageHandler[]>();

/**
 * Listens to a message of the other shards. Nothing is ever received when the bot runs in a single process.
 *
 * @param type - The type of the message.
 * @param handler - What to do with it.
 */
export function onShardMessage<Type extends ShardMessageType>(type: Type, handler: (message: ShardMessage<Type>) => void) {
	const list = handlers.get(type) ?? [];
	list.push(handler as ShardMessageHandler);
	handlers.set(type, list);
}

/**
 * Sends a message to every other shard. Does nothing when the bot runs in a single process.
 *
 * @param message - The message to send.
 */
export function broadcastShardMessage(message: ShardMessage) {
	const shard = container.shard ?? null;
	if (shard === null) return;

	void shard.trySend(message, 'all').then((result) => result.inspectErr((error) => container.logger.error(`${header} ${error.message}`)));
}

declare module '@sapphire/pieces' {
	interface Container {
		/**
		 * The shard's side of the sharder, `null` when the bot runs in a single process.
		 */
		shard: ShardClient | null;
	}
}
