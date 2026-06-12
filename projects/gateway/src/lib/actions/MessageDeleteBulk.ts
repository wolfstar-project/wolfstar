import { isNullish } from '@sapphire/utilities';
import type { GatewayMessageDeleteBulkDispatchData } from 'discord-api-types/v10';
import { container } from 'wolfstar-shared';

export async function handleMessageDeleteBulk(payload: GatewayMessageDeleteBulkDispatchData) {
	if (!('guild_id' in payload)) return;
	if (isNullish(payload.guild_id)) return;

	await container.managers.messages.handleDeleteBulk(payload.guild_id, payload);
}
