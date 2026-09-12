import { isNullish } from '@sapphire/utilities';
import type { GatewayMessageCreateDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleMessageCreate(payload: GatewayMessageCreateDispatchData) {
	if (!('guild_id' in payload)) return;
	if (isNullish(payload.guild_id)) return;

	await container.managers.messages.handleCreate(payload);
}
