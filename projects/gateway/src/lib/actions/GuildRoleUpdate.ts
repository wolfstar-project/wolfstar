import type { GatewayGuildRoleUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildRoleUpdate(payload: GatewayGuildRoleUpdateDispatchData) {
	await container.managers.roles.handleUpdate(payload);
}
