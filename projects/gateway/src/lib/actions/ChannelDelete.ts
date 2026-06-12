import { isNullish } from '@sapphire/utilities';
import type { GatewayChannelDeleteDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleChannelDelete(payload: GatewayChannelDeleteDispatchData) {
	if (!('guild_id' in payload)) return;
	if (isNullish(payload.guild_id)) return;

	await container.managers.channels.handleDelete(payload.guild_id, payload);
}
