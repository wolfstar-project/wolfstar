import type { GatewayGuildDeleteDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildDelete(payload: GatewayGuildDeleteDispatchData) {
	await container.managers.guilds.handleDelete(payload);
}
