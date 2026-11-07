import { renderMessageHistory } from '#lib/moderation/histories';
import { container } from '@wolfstar/http-framework';
import type { MessageHistory } from 'wolfstar-database';

/**
 * The file of a message history, with the names of the channels it was read from.
 *
 * @param history - The history.
 */
export async function getMessageHistoryFile(history: MessageHistory) {
	const { channels } = container.gatewayClient;
	const names = new Map<string, string>();
	for (const channelId of new Set(history.messages.map((message) => message.channelId))) {
		const channel = await channels.cache.get(channelId);
		names.set(channelId, channel && 'name' in channel && channel.name ? channel.name : channelId);
	}

	const text = renderMessageHistory(history, (channelId) => names.get(channelId) ?? channelId);
	return { name: `history-${history.id}.txt`, data: Buffer.from(text, 'utf8'), contentType: 'text/plain' };
}
