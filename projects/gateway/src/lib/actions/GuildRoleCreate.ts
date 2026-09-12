import type { GatewayGuildRoleCreateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildRoleCreate(payload: GatewayGuildRoleCreateDispatchData) {
	await container.managers.roles.handleCreate(payload);
}
