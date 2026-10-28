import { Collection } from '@discordjs/collection';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * What each guild has of something the bot reads from the database and keeps, such as the thresholds of warnings:
 * read once, then served from memory until it is forgotten.
 *
 * @remarks
 *
 * A read that started before the guild was forgotten holds what the database had then, so it does not go in the
 * cache: the dashboard writes these rows too, and a removed rule must not come back because a query was still
 * running when the write was announced. Reads running at the same time share one query.
 */
export class GuildCache<T> {
	readonly #entries = new Collection<Snowflake, T>();
	readonly #queries = new Collection<Snowflake, Promise<T>>();
	/** How many times each guild was forgotten. */
	readonly #versions = new Collection<Snowflake, number>();
	/** How many times every guild was forgotten at once. */
	#epoch = 0;

	public constructor(private readonly fetch: (guildId: Snowflake) => Promise<T>) {}

	/**
	 * Reads what a guild has, from the cache after the first time.
	 *
	 * @param guildId - The ID of the guild.
	 */
	public read(guildId: Snowflake): Promise<T> {
		const cached = this.#entries.get(guildId);
		if (cached !== undefined) return Promise.resolve(cached);

		const running = this.#queries.get(guildId);
		if (running) return running;

		const version = this.#versions.get(guildId) ?? 0;
		const epoch = this.#epoch;
		const query = this.fetch(guildId)
			.then((value) => {
				if ((this.#versions.get(guildId) ?? 0) === version && this.#epoch === epoch) this.#entries.set(guildId, value);
				return value;
			})
			.finally(() => {
				if (this.#queries.get(guildId) === query) this.#queries.delete(guildId);
			});
		this.#queries.set(guildId, query);
		return query;
	}

	/**
	 * Forgets what a guild has, so it is read again the next time it is needed.
	 *
	 * @param guildId - The ID of the guild.
	 */
	public forget(guildId: Snowflake): void {
		this.#versions.set(guildId, (this.#versions.get(guildId) ?? 0) + 1);
		this.#entries.delete(guildId);
		// A query that is still running read before the change:
		this.#queries.delete(guildId);
	}

	/**
	 * Forgets what every guild has, as when the notifications of the dashboard may have been missed.
	 */
	public forgetAll(): void {
		this.#epoch++;
		this.#entries.clear();
		this.#queries.clear();
	}
}
