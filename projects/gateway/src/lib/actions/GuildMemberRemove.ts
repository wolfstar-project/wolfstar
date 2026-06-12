import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildMemberRemove(payload: GatewayGuildMemberRemoveDispatchData) {
	await container.managers.members.handleRemove(payload);
}
