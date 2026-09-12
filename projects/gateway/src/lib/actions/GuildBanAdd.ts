import type { GatewayGuildBanAddDispatchData } from 'discord-api-types/v10';
import { container, RedisMessageType } from 'wolfstar-shared';

export async function handleGuildBanAdd(payload: GatewayGuildBanAddDispatchData) {
	await container.broker.send({ type: RedisMessageType.GuildBanAdd, data: payload });
}
