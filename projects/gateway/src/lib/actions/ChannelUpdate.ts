import { isNullish } from '@sapphire/utilities';
import type { GatewayChannelUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleChannelUpdate(payload: GatewayChannelUpdateDispatchData) {
	if (!('guild_id' in payload)) return;
	if (isNullish(payload.guild_id)) return;

	await container.managers.channels.handleUpdate(payload.guild_id, payload);
}
