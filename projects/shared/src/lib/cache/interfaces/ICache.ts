import type { Awaitable, NonNullObject } from '@sapphire/utilities';
import type { ScopedCache } from '../base/ScopedCache.js';
import type { IStructure } from '../structures/interfaces/IStructure.js';
import type { IStructureCreator } from '../structures/interfaces/IStructureCreator.js';

/**
 * The guild-scoped cache contract aligned with the discord.js async caching RFC
 * (discordjs/discord.js#11426).
 *
 * @remark Unlike the upstream proposal, wolfstar caches are scoped under a parent
 * (the guild or channel ID), so every operation takes a `parentId` in addition to
 * the entry key. The semantics of each method match the RFC otherwise.
 */
export interface ICache<T extends IStructure> {
	/**
	 * The creator used to construct and patch the structures this cache holds.
	 */
	readonly structure: IStructureCreator<T>;

	/**
	 * Retrieves an entry from the cache.
	 */
	get(parentId: ScopedCache.Snowflake, entryId: ScopedCache.Snowflake): Awaitable<T | null>;

	/**
	 * Sets one or more entries in the cache.
	 */
	set(parentId: ScopedCache.Snowflake, entries: T | readonly T[]): Awaitable<unknown>;

	/**
	 * Adds or updates data in the cache, returning the instantiated structure.
	 * If the entry exists it is patched with the new data unless `overwrite` is `true`;
	 * otherwise a new instance is constructed and stored.
	 */
	add(parentId: ScopedCache.Snowflake, data: NonNullObject, overwrite?: boolean): Awaitable<T>;

	/**
	 * Checks whether an entry exists in the cache.
	 */
	has(parentId: ScopedCache.Snowflake, entryId: ScopedCache.Snowflake): Awaitable<boolean>;

	/**
	 * Deletes one or more entries from the cache, returning the amount removed.
	 */
	delete(parentId: ScopedCache.Snowflake, entries: ScopedCache.Snowflake | readonly ScopedCache.Snowflake[]): Awaitable<number>;

	/**
	 * Clears all entries scoped under `parentId`.
	 */
	clear(parentId: ScopedCache.Snowflake): Awaitable<boolean>;

	/**
	 * Gets the number of entries scoped under `parentId`.
	 */
	getSize(parentId: ScopedCache.Snowflake): Awaitable<number>;
}

/**
 * Options shared by every manager `fetch` method, mirroring the RFC's `FetchOptions`.
 */
export interface FetchOptions {
	/**
	 * Whether to skip the cache check and force an API request.
	 */
	force?: boolean;

	/**
	 * Whether to cache the fetched result.
	 */
	cache?: boolean;
}
