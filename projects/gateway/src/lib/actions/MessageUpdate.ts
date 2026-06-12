import { isNullish } from '@sapphire/utilities';
import type { GatewayMessageUpdateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleMessageUpdate(payload: GatewayMessageUpdateDispatchData) {
	if (!('guild_id' in payload)) return;
	if (isNullish(payload.guild_id)) return;

	await container.managers.messages.handleUpdate(payload);
}
