import { bold, magenta } from 'colorette';

/**
 * Formats the header of a shard's log line.
 *
 * @param shardId - The ID of the shard.
 * @param title - What happened to the shard, already coloured.
 */
export function getShardHeader(shardId: number, title: string): string {
	return `${bold(magenta(`[SHARD ${shardId}]`))} ${title}`;
}
