import type { GatewayGuildRoleDeleteDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildRoleDelete(payload: GatewayGuildRoleDeleteDispatchData) {
	await container.managers.roles.handleDelete(payload);
}
