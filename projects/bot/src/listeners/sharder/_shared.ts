import { bold, magenta } from 'colorette';

/**
 * Formats the header of a log line of the shard manager about one of its shards (the processes it spawns).
 *
 * @param channelId - The ID of the shard.
 * @param title - What happened to the shard, already coloured.
 */
export function getSharderHeader(channelId: number, title: string): string {
	return `${bold(magenta(`[SHARDER ${channelId}]`))} ${title}`;
}
