import type { GatewayGuildEmojisUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildEmojisUpdate(payload: GatewayGuildEmojisUpdateDispatchData) {
	await container.managers.emojis.handleUpdate(payload);
}
