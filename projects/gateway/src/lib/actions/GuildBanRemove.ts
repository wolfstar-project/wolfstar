import type { GatewayGuildBanRemoveDispatchData } from 'discord-api-types/v10';
import { container, RedisMessageType } from 'wolfstar-shared';

export async function handleGuildBanRemove(payload: GatewayGuildBanRemoveDispatchData) {
	await container.broker.send({ type: RedisMessageType.GuildBanRemove, data: payload });
}
