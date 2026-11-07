import { container } from '@wolfstar/http-framework';

let messageCount = 0;

/**
 * Counts a message the bot saw, written to the analytics by the next sync.
 */
export function countMessage() {
	messageCount++;
}

/**
 * Takes the messages counted since the last call, and starts the count again.
 */
export function takeMessageCount() {
	const count = messageCount;
	messageCount = 0;
	return count;
}

/**
 * Sums the approximate member counts of every guild the bot is in, 200 guilds at a time.
 *
 * @remarks
 *
 * The members are not all cached, and the guilds are in Redis, so the count comes from the API rather than from
 * `guild.memberCount` like on discord.js.
 */
export async function fetchApproximateUserCount() {
	const { api } = container.gatewayClient;

	let total = 0;
	let after: string | undefined;
	while (true) {
		const guilds = await api.users.getGuilds({ limit: 200, with_counts: true, after });
		for (const guild of guilds) total += guild.approximate_member_count ?? 0;

		if (guilds.length < 200) return total;
		after = guilds.at(-1)!.id;
	}
}

/**
 * The shard a guild is on, for the `shard` tag: the structures of the gateway plugin do not hold it.
 */
export async function fetchShardId(guildId: string) {
	const shardCount = await container.gatewayClient.gateway.getShardCount();
	return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}
