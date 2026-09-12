import { Collection } from '@discordjs/collection';
import { isNullish, type NonNullObject } from '@sapphire/utilities';
import { Reader } from '../../data/Reader.js';
import type { IStructure } from '../structures/interfaces/IStructure.js';
import type { IStructureCreator } from '../structures/interfaces/IStructureCreator.js';
import type { ICache } from '../interfaces/ICache.js';
import { ScopedCache } from './ScopedCache.js';

export abstract class HashScopedCache<T extends IStructure> extends ScopedCache implements ICache<T> {
	public abstract readonly tail: string;
	public abstract readonly structure: IStructureCreator<T>;

	/**
	 * Sets an entry to the hashmap.
	 * @param parentId The parent's ID.
	 * @param entries The entries to set to the cache. Duplicated entries will be replaced.
	 */
	public set(parentId: ScopedCache.Snowflake, entries: T | readonly T[]) {
		return Array.isArray(entries) ? this.setMany(parentId, entries as readonly T[]) : this.setOne(parentId, entries as T);
	}

	/**
	 * Adds or updates an entry from raw API data, returning the stored structure.
	 *
	 * If the entry already exists and `overwrite` is `false`, it is patched with the
	 * new data; otherwise a fresh instance is constructed. Patching uses the
	 * structure's {@link IStructureCreator.patch} when available, falling back to a
	 * full reconstruction that merges the existing serialized value with `data`.
	 * @param parentId The parent's ID.
	 * @param data The raw API data to store. Must carry the entry's identity.
	 * @param overwrite Whether to replace an existing entry instead of patching it.
	 */
	public async add(parentId: ScopedCache.Snowflake, data: NonNullObject, overwrite = false): Promise<T> {
		const id = this.structure.getId?.(data) ?? BigInt((data as { id: ScopedCache.Snowflake }).id);
		const existing = overwrite ? null : await this.getOne(parentId, id);

		const value =
			existing === null //
				? this.structure.fromAPI(data)
				: (this.structure.patch?.(existing, data) ?? this.structure.fromAPI({ ...existing.toJSON(), ...data }));

		await this.setOne(parentId, value);
		return value;
	}

	/**
	 * Checks whether or not an ID is in the hashmap.
	 * @param parentId The parent's ID.
	 * @param entryId The entry's ID to check.
	 */
	public async has(parentId: ScopedCache.Snowflake, entryId: ScopedCache.Snowflake) {
		const data = await this.client.hexists(this.makeId(parentId), entryId.toString());
		return data === 1;
	}

	/**
	 * Gets an entry by its ID from the hashmap.
	 * @param parentId The parent's ID.
	 * @param entryId The entry's ID to retrieve.
	 * @returns The entry, if any.
	 */
	public async get(parentId: ScopedCache.Snowflake, entryId: ScopedCache.Snowflake): Promise<T | null>;
	/**
	 * Gets multiple entries by its ID from the hashmap.
	 * @param parentId The parent's ID.
	 * @param entries The IDs of the entries to retrieve.
	 * @returns The entries inside a Collection, keyed by their ID.
	 * @remark The IDs of entries that do not exist are dropped.
	 */
	public async get(parentId: ScopedCache.Snowflake, entries: readonly ScopedCache.Snowflake[]): Promise<Collection<bigint, T>>;
	public async get(parentId: ScopedCache.Snowflake, entries: ScopedCache.Snowflake | readonly ScopedCache.Snowflake[]) {
		return Array.isArray(entries)
			? this.getMany(parentId, entries as readonly ScopedCache.Snowflake[])
			: this.getOne(parentId, entries as ScopedCache.Snowflake);
	}

	/**
	 * Gets all the keys from the hashmap.
	 * @param parentId The parent's ID.
	 */
	public async keys(parentId: ScopedCache.Snowflake) {
		return this.client.hkeys(this.makeId(parentId));
	}

	/**
	 * Gets all the values from the hashmap.
	 * @param parentId The parent's ID.
	 */
	public async values(parentId: ScopedCache.Snowflake) {
		const buffers = await this.client.hvalsBuffer(this.makeId(parentId));
		return buffers.map((buffer) => this.structure.fromBinary(new Reader(buffer)));
	}

	/**
	 * Gets all the entries from the hashmap.
	 * @param parentId The parent's ID.
	 * @returns The entries inside a Collection, keyed by their ID.
	 */
	public async entries(parentId: ScopedCache.Snowflake) {
		const buffers = await this.client.hvalsBuffer(this.makeId(parentId));

		const result = new Collection<bigint, T>();
		for (const buffer of buffers) {
			const channel = this.structure.fromBinary(new Reader(buffer));
			result.set(channel.id, channel);
		}

		return result;
	}

	/**
	 * Counts the amount of entries in the hashmap.
	 * @param parentId The parent's ID.
	 * @returns The amount of entries the hashmap has.
	 */
	public count(parentId: ScopedCache.Snowflake) {
		return this.client.hlen(this.makeId(parentId));
	}

	/**
	 * Gets the number of entries scoped under `parentId`.
	 * @remark RFC alias of {@link HashScopedCache.count}.
	 */
	public getSize(parentId: ScopedCache.Snowflake) {
		return this.count(parentId);
	}

	/**
	 * Removes one or more entries from the hashmap.
	 * @param parentId The parent's ID.
	 * @param entries The IDs of the entries to remove.
	 * @returns The amount of entries that were removed.
	 */
	public async remove(parentId: ScopedCache.Snowflake, entries: ScopedCache.Snowflake | readonly ScopedCache.Snowflake[]) {
		const result = await (Array.isArray(entries)
			? this.client.hdel(this.makeId(parentId), ...entries.map((entry: ScopedCache.Snowflake) => entry.toString()))
			: this.client.hdel(this.makeId(parentId), entries.toString()));
		return result;
	}

	/**
	 * Deletes one or more entries from the hashmap.
	 * @remark RFC alias of {@link HashScopedCache.remove}.
	 */
	public delete(parentId: ScopedCache.Snowflake, entries: ScopedCache.Snowflake | readonly ScopedCache.Snowflake[]) {
		return this.remove(parentId, entries);
	}

	/**
	 * Removes the hashmap from the cache, effectively clearing all of its entries.
	 * @param parentId The parent's ID.
	 * @returns Whether or not the hashmap has been cleared.
	 */
	public async clear(parentId: ScopedCache.Snowflake) {
		const result = await this.client.del(this.makeId(parentId));
		return result > 0;
	}

	protected override makeId(parentId: ScopedCache.Snowflake) {
		// eslint-disable-next-line @typescript-eslint/dot-notation
		return `${this.parent['prefix']}${parentId}${this.tail}`;
	}

	private async getOne(parentId: ScopedCache.Snowflake, entryId: ScopedCache.Snowflake) {
		const data = await this.client.hgetBuffer(this.makeId(parentId), entryId.toString());
		return data ? this.structure.fromBinary(new Reader(data)) : null;
	}

	private async getMany(parentId: ScopedCache.Snowflake, entries: readonly ScopedCache.Snowflake[]): Promise<Collection<bigint, T>> {
		const buffers = await this.client.hmgetBuffer(this.makeId(parentId), ...entries.map((entry) => entry.toString()));

		const result = new Collection<bigint, T>();
		for (const buffer of buffers) {
			if (isNullish(buffer)) continue;

			const channel = this.structure.fromBinary(new Reader(buffer));
			result.set(channel.id, channel);
		}

		return result;
	}

	private async setOne(parentId: ScopedCache.Snowflake, entry: T) {
		await this.client.hset(this.makeId(parentId), entry.id.toString(), entry.toBuffer());
	}

	private async setMany(parentId: ScopedCache.Snowflake, entries: readonly T[]) {
		if (entries.length === 0) return;
		if (entries.length === 1) return this.setOne(parentId, entries[0]);
		await this.client.hmset(this.makeId(parentId), ...entries.flatMap((entry) => [entry.id.toString(), entry.toBuffer()]));
	}
}

export namespace HashScopedCache {
	export type Snowflake = ScopedCache.Snowflake;
}
