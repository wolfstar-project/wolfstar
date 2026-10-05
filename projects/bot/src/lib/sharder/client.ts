import { dispatchShardMessage, type ShardMessage } from '#lib/sharder/messages';
import { container } from '@wolfstar/http-framework';
import type { GatewayClient } from '@wolfstar/plugin-gateway';
import { ShardClient } from '@wolfstar/plugin-sharder';

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
		dispatchShardMessage(body);
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

declare module '@sapphire/pieces' {
	interface Container {
		/**
		 * The shard's side of the sharder, `null` when the bot runs in a single process.
		 */
		shard: ShardClient | null;
	}
}
