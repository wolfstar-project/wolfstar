import type { GatewayMessageReactionRemoveDispatchData } from 'discord-api-types/v10';
import { container, RedisMessageType } from 'wolfstar-shared';

export async function handleMessageReactionRemove(payload: GatewayMessageReactionRemoveDispatchData) {
	await container.broker.send({ type: RedisMessageType.MessageReactionRemove, data: payload });
}
