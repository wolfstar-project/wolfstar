import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import {
	deleteAutoDelete,
	deleteAutoPurge,
	fetchAutoDeletes,
	fetchAutoPurges,
	MaximumAutoDeleteChannels,
	MaximumAutoPurgeChannels,
	setAutoDelete,
	setAutoPurge,
	type AutoDelete,
	type AutoDeleteData,
	type AutoPurge,
	type AutoPurgeData
} from 'wolfstar-database';

/**
 * The channels of each guild whose messages are deleted, which every message that is sent is checked against.
 */
const cache = new Collection<Snowflake, readonly AutoDelete[]>();
const queue = new Collection<Snowflake, Promise<readonly AutoDelete[]>>();

/**
 * Thrown when a guild already has the most channels it can have purged, or have their messages deleted.
 */
export class CleanupLimitError extends Error {
	public constructor(public readonly maximum: number) {
		super(`Cleanup limit reached: ${maximum}`);
	}
}

/**
 * Reads the channels of a guild whose messages are deleted, from the cache after the first time.
 *
 * @param guildId - The ID of the guild.
 */
export function readAutoDeletes(guildId: Snowflake): readonly AutoDelete[] | Promise<readonly AutoDelete[]> {
	return cache.get(guildId) ?? fetchDeletes(guildId);
}

function fetchDeletes(guildId: Snowflake) {
	const previous = queue.get(guildId);
	if (previous) return previous;

	const promise = fetchAutoDeletes(container.prisma.orm, guildId)
		.then((configs) => {
			// A change that was made while the query ran dropped it from the queue, and what it read is not cached:
			if (queue.get(guildId) === promise) cache.set(guildId, configs);
			return configs;
		})
		.finally(() => {
			if (queue.get(guildId) === promise) queue.delete(guildId);
		});
	queue.set(guildId, promise);
	return promise;
}

function forget(guildId: Snowflake) {
	cache.delete(guildId);
	queue.delete(guildId);
}

// The deletions are cached by every shard process, so a change in one of them makes the copies of the others stale.
onShardMessage('cleanupUpdate', ({ guildId }) => forget(guildId));

function changed(guildId: Snowflake) {
	forget(guildId);
	broadcastShardMessage({ type: 'cleanupUpdate', guildId });
}

/**
 * Deletes the messages of a channel from now on, with the settings it is given, which replace the ones it had.
 *
 * @throws {@linkcode CleanupLimitError} When the guild has the most channels it can have and this is one more.
 */
export async function enableAutoDelete(guildId: Snowflake, data: AutoDeleteData): Promise<AutoDelete> {
	const { prisma } = container;
	const existing = await fetchAutoDeletes(prisma.orm, guildId);
	if (existing.length >= MaximumAutoDeleteChannels && !existing.some((config) => config.channelId === data.channelId)) {
		throw new CleanupLimitError(MaximumAutoDeleteChannels);
	}

	const config = await setAutoDelete(prisma, guildId, data);
	changed(guildId);
	return config;
}

/**
 * Stops deleting the messages of a channel.
 *
 * @returns Whether its messages were deleted.
 */
export async function disableAutoDelete(guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	const deleted = await deleteAutoDelete(container.prisma, guildId, channelId);
	if (deleted) changed(guildId);
	return deleted;
}

/**
 * Reads the channels of a guild that are purged. They are read by the commands and by the task that runs them, not
 * by every message, so they are not cached.
 */
export function readAutoPurges(guildId: Snowflake): Promise<AutoPurge[]> {
	return fetchAutoPurges(container.prisma.orm, guildId);
}

/**
 * Purges a channel every interval from now on, with the settings it is given, which replace the ones it had. The first
 * purge is one interval away.
 *
 * @throws {@linkcode CleanupLimitError} When the guild has the most channels it can have and this is one more.
 */
export async function enableAutoPurge(guildId: Snowflake, data: AutoPurgeData): Promise<AutoPurge> {
	const { prisma } = container;
	const existing = await fetchAutoPurges(prisma.orm, guildId);
	if (existing.length >= MaximumAutoPurgeChannels && !existing.some((purge) => purge.channelId === data.channelId)) {
		throw new CleanupLimitError(MaximumAutoPurgeChannels);
	}

	return setAutoPurge(prisma, guildId, data, Date.now() + data.interval);
}

/**
 * Stops purging a channel.
 *
 * @returns Whether it was purged.
 */
export function disableAutoPurge(guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	return deleteAutoPurge(container.prisma, guildId, channelId);
}
