import { isShardManager } from '#lib/sharder/manager';
import { Listener } from '@wolfstar/http-framework';

/**
 * A listener of the events of the shard manager (`container.shardManager`). It is only enabled in the process that
 * spawns the shards, the only one that has a manager.
 */
export abstract class SharderListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: SharderListener.Options) {
		super(context, { ...options, emitter: 'shardManager', enabled: isShardManager() });
	}
}

export namespace SharderListener {
	export type LoaderContext = Listener.LoaderContext;
	export type Options = Omit<Listener.Options, 'emitter' | 'enabled'>;
}
