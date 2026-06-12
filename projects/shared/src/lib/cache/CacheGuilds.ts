import { Collection } from '@discordjs/collection';
import { isNullish } from '@sapphire/utilities';
import { count } from 'ix/asynciterable/count.js';
import { Reader } from '../data/Reader.js';
import { ScopedCache } from './base/ScopedCache.js';
import { Guild } from './structures/Guild.js';

export class CacheGuilds extends ScopedCache {
	public async set(guild: Guild) {
		await this.client.set(this.makeId(guild.id), guild.toBuffer());
	}

	/**
	 * Adds or updates a guild from raw API data, returning the stored structure.
	 *
	 * If the guild already exists and `overwrite` is `false`, the existing value is
	 * merged with `data` before being reconstructed; otherwise a fresh instance is
	 * built from `data` alone.
	 * @param data The raw API guild data to store.
	 * @param overwrite Whether to replace an existing guild instead of patching it.
	 */
	public async add(data: Guild.Json, overwrite = false): Promise<Guild> {
		const existing = overwrite ? null : await this.get(BigInt(data.id));
		const value = existing === null ? Guild.fromAPI(data) : Guild.fromAPI({ ...existing.toJSON(), ...data });
		await this.set(value);
		return value;
	}

	public async has(guildId: ScopedCache.Snowflake) {
		const data = await this.client.exists(this.makeId(guildId));
		return data === 1;
	}

	public async get(guildId: ScopedCache.Snowflake) {
		const data = await this.client.getBuffer(this.makeId(guildId));
		return data ? Guild.fromBinary(new Reader(data)) : null;
	}

	public async getAll() {
		const result = new Collection<bigint, Guild>();
		for await (const guild of this.values()) {
			result.set(guild.id, guild);
		}

		return result;
	}

	public count() {
		return count(this.client.scanBufferStream({ match: this.makeId('*'), count: 100 }));
	}

	/**
	 * Gets the number of cached guilds.
	 * @remark RFC alias of {@link CacheGuilds.count}.
	 */
	public getSize() {
		return this.count();
	}

	public async remove(guildId: ScopedCache.Snowflake) {
		const key = this.makeId(guildId);
		const result = await this.client.del(key, `${key}:channels`, `${key}:emojis`, `${key}:members`, `${key}:roles`, `${key}:stickers`);
		return result > 0;
	}

	/**
	 * Deletes a guild and all of its scoped sub-caches.
	 * @remark RFC alias of {@link CacheGuilds.remove}.
	 */
	public delete(guildId: ScopedCache.Snowflake) {
		return this.remove(guildId);
	}

	public async *keys(): AsyncIterable<bigint> {
		// eslint-disable-next-line @typescript-eslint/dot-notation
		const offset = this.parent['prefix'].length;
		for await (const id of this.client.scanStream({ match: this.makeId('*'), count: 100 }) as AsyncIterable<string>) {
			yield BigInt(id.slice(offset));
		}
	}

	public async *values(): AsyncIterable<Guild> {
		const match = this.makeId('*');
		const count = 100;

		let cursor = '0';
		do {
			const [next, keys] = await this.client.scanBuffer(cursor, 'MATCH', match, 'COUNT', count);
			const buffers = await this.client.mgetBuffer(...keys);
			for (const buffer of buffers) {
				if (isNullish(buffer)) continue;
				yield Guild.fromBinary(new Reader(buffer));
			}

			cursor = next.toString();
		} while (cursor !== '0');
	}

	public async *entries(): AsyncIterable<[id: bigint, value: Guild]> {
		for await (const value of this.values()) {
			yield [value.id, value];
		}
	}
}
