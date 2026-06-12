import type { GatewayGuildUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildUpdate(payload: GatewayGuildUpdateDispatchData) {
	await container.managers.guilds.handleUpdate(payload);
}
