import type { GatewayGuildMemberAddDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildMemberAdd(payload: GatewayGuildMemberAddDispatchData) {
	await container.managers.members.handleAdd(payload);
}
