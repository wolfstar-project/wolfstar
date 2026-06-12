import type { GatewayGuildStickersUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildStickersUpdate(payload: GatewayGuildStickersUpdateDispatchData) {
	await container.managers.stickers.handleUpdate(payload);
}
