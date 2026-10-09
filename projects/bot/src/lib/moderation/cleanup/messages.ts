import type { BooleanFn } from '#common';
import { getLogger } from '#utils/functions';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Message } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';
import { setTimeout as sleep } from 'node:timers/promises';

export interface FetchChannelMessagesOptions {
	/** How many messages to collect at most. */
	limit: number;
	/** Whether the history is read before or after {@linkcode positionId}, the latest messages when it has none. */
	position: 'before' | 'after';
	positionId?: string | undefined;
	/** Which messages are collected. */
	filter: BooleanFn<[Message]>;
}

/**
 * The most pages of a hundred messages a scan reads, so a filter that finds nothing does not read a whole channel.
 */
const MaximumPages = 10;

/**
 * Collects the messages of a channel that pass a filter, reading its history a page at a time.
 *
 * @remarks It reads until it collected enough, the history ended or {@linkcode MaximumPages} pages were read, and waits
 * between the pages, since Discord rate limits the history requests.
 */
export async function fetchChannelMessages(channelId: string, options: FetchChannelMessagesOptions): Promise<Message[]> {
	const { limit, position, filter } = options;
	const { messages: manager } = container.gatewayClient;

	const collected = new Map<string, Message>();
	let cursor = options.positionId;
	let remaining = limit;

	for (let pages = 0; remaining > 0 && pages < MaximumPages; pages++) {
		const page = await manager.list(channelId, { limit: 100, [position]: cursor });
		if (page.length === 0) break;

		const sorted = [...page].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
		for (const message of sorted) {
			if (remaining <= 0) break;
			if (!filter(message)) continue;

			collected.set(message.id, message);
			remaining--;
		}

		// The next page starts where this one ended, whatever it had to collect: the messages a filter looks for may
		// be further away, and a cursor on a collected message would read the ones between them again.
		cursor = position === 'before' ? sorted.at(-1)!.id : sorted[0].id;
		if (remaining > 0 && page.length === 100) await sleep(2000);
		else break;
	}

	return [...collected.values()];
}

/**
 * Deletes messages of a channel in bulk, a hundred at a time, ignoring the ones that were deleted in the meantime.
 *
 * @remarks The prune logger is told the bot is who deletes, so the message delete logs are not written for each one.
 * @returns How many messages were deleted.
 */
export async function bulkDeleteChannelMessages(guildId: string, channelId: string, messages: readonly Message[]): Promise<number> {
	const logger = await getLogger(guildId);
	logger.prune.set(channelId, { userId: container.gatewayClient.user!.id });

	const { messages: manager } = container.gatewayClient;
	const ids = messages.map((message) => message.id);
	let deleted = 0;

	for (let i = 0; i < ids.length; i += 100) {
		try {
			deleted += (await manager.bulkDelete(channelId, ids.slice(i, i + 100), true)).size;
		} catch (error) {
			logger.prune.unset(channelId);
			if (!(error instanceof DiscordAPIError) || error.code !== RESTJSONErrorCodes.UnknownMessage) throw error;
		}
	}

	return deleted;
}
