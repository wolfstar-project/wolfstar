import { isNullish } from '@sapphire/utilities';
import type { GatewayChannelCreateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleChannelCreate(payload: GatewayChannelCreateDispatchData) {
	if (!('guild_id' in payload)) return;
	if (isNullish(payload.guild_id)) return;

	await container.managers.channels.handleCreate(payload.guild_id, payload);
}
