import type { GatewayGuildMemberUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildMemberUpdate(payload: GatewayGuildMemberUpdateDispatchData) {
	await container.managers.members.handleUpdate(payload);
}
