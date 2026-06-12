import type { GatewayMessageReactionAddDispatchData } from 'discord-api-types/v10';
import { container, RedisMessageType } from 'wolfstar-shared';

export async function handleMessageReactionAdd(payload: GatewayMessageReactionAddDispatchData) {
	await container.broker.send({ type: RedisMessageType.MessageReactionAdd, data: payload });
}
