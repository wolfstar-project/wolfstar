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
 * Collects the messages of a channel that pass a filter, reading its history a page at a time.
 *
 * @remarks It stops at the first page that has nothing to collect, and waits between the pages, since Discord rate
 * limits the history requests.
 */
export async function fetchChannelMessages(channelId: string, options: FetchChannelMessagesOptions): Promise<Message[]> {
	const { limit, position, filter } = options;
	const { messages: manager } = container.gatewayClient;

	const collected = new Map<string, Message>();
	let cursor = options.positionId;
	let remaining = limit;

	while (remaining > 0) {
		const page = await manager.list(channelId, { limit: 100, [position]: cursor });
		const filtered = page.filter((message) => filter(message)).sort((a, b) => b.createdTimestamp - a.createdTimestamp);

		for (const message of filtered) {
			if (remaining <= 0) break;
			collected.set(message.id, message);
			remaining--;
		}

		// Keep paging while the page had something to delete, Discord rate limits the history requests:
		if (remaining <= 0 || filtered.length === 0) break;
		cursor = position === 'before' ? filtered.at(-1)!.id : filtered[0].id;
		await sleep(2000);
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
