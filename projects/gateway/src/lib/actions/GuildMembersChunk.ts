import type { GatewayGuildMembersChunkDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleGuildMembersChunk(payload: GatewayGuildMembersChunkDispatchData) {
	await container.managers.members.handleChunk(payload);
}
