import type { REST } from '@discordjs/rest';
import type { NonNullObject } from '@sapphire/utilities';
import type { HashScopedCache, IStructure, MessageBroker, ScopedCache } from 'wolfstar-shared';

/**
 * Base class for guild-scoped managers, mirroring the discord.js
 * `CachedManager` pattern (discordjs/discord.js#11426) on top of wolfstar's
 * Redis-backed {@link HashScopedCache}.
 *
 * A manager owns the cache and message-broker interaction for a single entity
 * type, keeping the WebSocket action handlers thin.
 */
export abstract class BaseScopedManager<T extends IStructure> {
	public constructor(
		public readonly cache: HashScopedCache<T>,
		protected readonly broker: MessageBroker,
		protected readonly rest?: REST
	) {}

	/**
	 * Stores `data` in the cache, returning both the previously cached value (if
	 * any) and the resulting structure. When `overwrite` is `false`, an existing
	 * entry is patched rather than replaced.
	 */
	protected async upsert(parentId: ScopedCache.Snowflake, data: NonNullObject, overwrite = false): Promise<BaseScopedManager.AddResult<T>> {
		const id = this.cache.structure.getId?.(data) ?? BigInt((data as { id: ScopedCache.Snowflake }).id);
		const old = overwrite ? null : await this.cache.get(parentId, id);
		const value = await this.cache.add(parentId, data, overwrite);
		return { old, value };
	}
}

export namespace BaseScopedManager {
	export interface AddResult<T> {
		old: T | null;
		value: T;
	}
}
