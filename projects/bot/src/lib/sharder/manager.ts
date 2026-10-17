import { parseInternationalizationOptions } from '#lib/i18n/options';
import { isWorker } from '#utils/worker';
import { envParseBoolean, envParseInteger, envParseString } from '@wolfstar/env-utilities';
import { Client, container } from '@wolfstar/http-framework';
import { ShardClient, ShardManager } from '@wolfstar/plugin-sharder';
import { fileURLToPath } from 'node:url';

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
 * The gateway shards are `SHARDER_TOTAL_SHARDS` (Discord's recommended count by default), split across `SHARDER_CLUSTERS` processes (one per CPU core by
 * default). The shards are cluster workers, so they share the ports of the interactions endpoint and of the API, and
 * the manager balances the connections between them.
 */
export async function startShardManager() {
	const clusters = envParseInteger('SHARDER_CLUSTERS', 0);
	const totalShards = envParseInteger('SHARDER_TOTAL_SHARDS', 0);
	const manager = new ShardManager({
		strategy: 'cluster',
		token: envParseString('DISCORD_TOKEN'),
		totalShards: totalShards > 0 ? totalShards : 'auto',
		shards: 'auto',
		clusters: clusters > 0 ? clusters : undefined,
		// The manager paces the identifies of every process (`ShardClient#identifyThrottler`), so nothing to wait for:
		spawn: { delay: 0 }
	});

	container.shardManager = manager;

	// A client that never listens nor connects: it gives this process the logger and the listener store. Of the pieces
	// of the bot, only the listeners of the manager's events are loaded (`src/listeners/sharder`):
	const client = new Client({
		discordToken: envParseString('DISCORD_TOKEN'),
		discordPublicKey: envParseString('DISCORD_PUBLIC_KEY'),
		api: { automaticallyConnect: false },
		// The plugins are registered for every client of the process, and the translations one needs its locales:
		i18n: parseInternationalizationOptions()
	});
	container.stores.get('listeners').registerPath(fileURLToPath(new URL('../../listeners/sharder', import.meta.url)));
	await client.load({ baseUserDirectory: null });

	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => void manager.destroy().finally(() => process.exit(0)));
	}

	await manager.spawn();
	return manager;
}

declare module '@sapphire/pieces' {
	interface Container {
		/**
		 * The shard manager, only set in the process that spawns the shards (see {@linkcode isShardManager}).
		 */
		shardManager: ShardManager;
	}
}
