import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { RESTGetAPICurrentUserGuildsQuery, RESTGetAPICurrentUserGuildsResult } from 'discord-api-types/v10';

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
 * What reads the guilds of the bot a page at a time: `container.gatewayClient.api.users`.
 */
export interface GuildPageReader {
	getGuilds(query: RESTGetAPICurrentUserGuildsQuery): Promise<RESTGetAPICurrentUserGuildsResult>;
}

/**
 * The approximate user count, or the status of the server error Discord answered with.
 */
export type ApproximateUserCount = { _tag: 'Counted'; users: number } | { _tag: 'Unavailable'; status: number };

/**
 * Sums the approximate member counts of every guild the bot is in, 200 guilds at a time.
 *
 * @remarks
 *
 * The members are not all cached, and the guilds are in Redis, so the count comes from the API rather than from
 * `guild.memberCount` like on discord.js.
 *
 * A server error of Discord (5xx, after the retries of the REST client) is an outage the bot cannot fix, so it is
 * answered as `Unavailable` and the caller skips the count. Any other error is a bug, and it is thrown.
 */
export async function fetchApproximateUserCount(reader: GuildPageReader): Promise<ApproximateUserCount> {
	let users = 0;
	let after: string | undefined;
	while (true) {
		const guilds = await reader.getGuilds({ limit: 200, with_counts: true, after }).catch((error: unknown) => {
			const status = getServerErrorStatus(error);
			if (status === null) throw error;
			return status;
		});
		if (typeof guilds === 'number') return { _tag: 'Unavailable', status: guilds };

		for (const guild of guilds) users += guild.approximate_member_count ?? 0;

		if (guilds.length < 200) return { _tag: 'Counted', users };
		after = guilds.at(-1)!.id;
	}
}

function getServerErrorStatus(error: unknown) {
	if (!(error instanceof HTTPError) && !(error instanceof DiscordAPIError)) return null;
	return error.status >= 500 ? error.status : null;
}

/**
 * The shard a guild is on, for the `shard` tag: the structures of the gateway plugin do not hold it.
 */
export async function fetchShardId(guildId: string) {
	const shardCount = await container.gatewayClient.gateway.getShardCount();
	return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}
