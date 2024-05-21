import { container } from '@sapphire/framework';
import { Time } from '@sapphire/time-utilities';

/**
 * Represents a {@link GuildMemberFetchQueue.shards} entry.
 */
interface GuildMemberFetchQueueShardEntry {
	/**
	 * The guild IDs pending to be fetched.
	 */
	pending: string[];

	/**
	 * The amount of guilds which members are currently being fetched.
	 */
	fetching: number;
}

const kMaximumQueriesPerMinute = 90;

export class GuildMemberFetchQueue {
	/**
	 * The interval
	 */
	public interval = setInterval(() => this.fetch(), Time.Minute).unref();

	/**
	 * The shard queues.
	 */
	private readonly shards = new Map<number, GuildMemberFetchQueueShardEntry>();

	/**
	 * Destroys the instance
	 */
	public destroy() {
		clearInterval(this.interval);
	}

	/**
	 * Adds a guild to the fetch queue.
	 * @param shardId The shard id of the guild.
	 * @param guildId The guild id to queue.
	 * @note This method is to be called on `GUILD_CREATE` raw event.
	 */
	public add(shardId: number, guildId: string) {
		const entry = this.shards.get(shardId);
		if (entry) {
			entry.pending.push(guildId);
		} else {
			this.shards.set(shardId, {
				fetching: 0,
				pending: [guildId]
			});
		}
	}

	/**
	 * Removes a guild from the fetch queue.
	 * @param shardId The shard id of the guild.
	 * @param guildId The guild id to queue.
	 * @note This method is to be called on `GUILD_DELETE` raw event.
	 */
	public remove(shardId: number, guildId: string) {
		const entry = this.shards.get(shardId);
		if (!entry) return;

		const index = entry.pending.indexOf(guildId);
		if (index === -1) return;

		entry.pending.splice(index, 1);
	}

	/**
	 * Fetches the members for each shard.
	 */
	public fetch() {
		for (const entry of this.shards.values()) this.fetchShard(entry);
	}

	/**
	 * Fetches 100 guilds from a specific shard.
	 * @param entry The shard entry to fetch, it is mutated by the method's operations.
	 */
	private fetchShard(entry: GuildMemberFetchQueueShardEntry) {
		// There must be less than 100 entries being fetched from the same shard, and at least one entry pending:
		while (entry.fetching < kMaximumQueriesPerMinute && entry.pending.length > 0) {
			const guildId = entry.pending.shift()!;
			const guild = container.client.guilds.cache.get(guildId);

			// If there is no guild, it's unavailable, skip it.
			if (!guild?.available) continue;

			// If it already has all the members, skip it.
			if (guild.memberCount === guild.members.cache.size) continue;

			guild.members
				.fetch()
				.catch((error) => container.logger.error(error))
				.finally(() => --entry.fetching);

			entry.fetching++;
		}
	}
}
