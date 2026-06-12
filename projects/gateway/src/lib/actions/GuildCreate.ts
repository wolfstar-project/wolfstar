import type { GatewayGuildCreateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildCreate(payload: GatewayGuildCreateDispatchData) {
	await container.managers.guilds.handleCreate(payload);
}
