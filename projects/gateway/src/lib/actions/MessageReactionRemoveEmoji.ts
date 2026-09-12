import type { GatewayMessageReactionRemoveEmojiDispatchData } from 'discord-api-types/v10';
import { container, RedisMessageType } from 'wolfstar-shared';

export async function handleMessageReactionRemoveEmoji(payload: GatewayMessageReactionRemoveEmojiDispatchData) {
	await container.broker.send({ type: RedisMessageType.MessageReactionRemoveEmoji, data: payload });
}
