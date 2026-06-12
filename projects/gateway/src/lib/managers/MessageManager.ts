import { BaseScopedManager } from './BaseScopedManager';
import { isNullish } from '@sapphire/utilities';
import type {
	GatewayMessageCreateDispatchData,
	GatewayMessageDeleteBulkDispatchData,
	GatewayMessageDeleteDispatchData,
	GatewayMessageUpdateDispatchData,
	Snowflake
} from 'discord-api-types/v10';
import { Message, RedisMessageType } from 'wolfstar-shared';

export class MessageManager extends BaseScopedManager<Message> {
	public async handleCreate(payload: GatewayMessageCreateDispatchData) {
		await this.cache.set(payload.channel_id, Message.fromAPI(payload));
		await this.broker.send({ type: RedisMessageType.MessageCreate, data: payload });
	}

	public async handleUpdate(payload: GatewayMessageUpdateDispatchData) {
		const { old } = await this.upsert(payload.channel_id, payload);
		await this.broker.send({ type: RedisMessageType.MessageUpdate, old: old?.toJSON() ?? null, data: payload });
	}

	public async handleDelete(guildId: Snowflake, payload: GatewayMessageDeleteDispatchData) {
		const old = await this.cache.get(payload.channel_id, payload.id);
		if (isNullish(old)) {
			await this.broker.send({
				type: RedisMessageType.MessageDelete,
				old: { id: payload.id, channel_id: payload.channel_id, guild_id: guildId }
			});
		} else {
			await this.cache.remove(payload.channel_id, payload.id);
			await this.broker.send({ type: RedisMessageType.MessageDelete, old: old.toJSON() });
		}
	}

	public async handleDeleteBulk(guildId: Snowflake, payload: GatewayMessageDeleteBulkDispatchData) {
		const entries = await this.cache.get(payload.channel_id, payload.ids);
		await this.cache.remove(payload.channel_id, payload.ids);

		await this.broker.send({
			type: RedisMessageType.MessageDeleteBulk,
			old: payload.ids.map((id) => entries.get(BigInt(id))?.toJSON() ?? { id }),
			channel_id: payload.channel_id,
			guild_id: guildId
		});
	}
}
