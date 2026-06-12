import { BaseScopedManager } from './BaseScopedManager';
import { isNullish } from '@sapphire/utilities';
import type { GatewayGuildStickersUpdateDispatchData } from 'discord-api-types/v10';
import { RedisMessageType, Sticker } from 'wolfstar-shared';

export class StickerManager extends BaseScopedManager<Sticker> {
	public async handleUpdate(payload: GatewayGuildStickersUpdateDispatchData) {
		const oldEntries = await this.cache.entries(payload.guild_id);

		for (const sticker of payload.stickers) {
			const updated = Sticker.fromAPI(sticker);
			const old = oldEntries.get(updated.id);

			if (isNullish(old)) {
				await this.cache.set(payload.guild_id, updated);
				await this.broker.send({ type: RedisMessageType.StickerCreate, data: sticker, guild_id: payload.guild_id });
			} else if (!updated.equals(old)) {
				await this.cache.set(payload.guild_id, updated);
				await this.broker.send({ type: RedisMessageType.StickerUpdate, old: old.toJSON(), data: sticker, guild_id: payload.guild_id });
			}

			// Drop processed entries; whatever remains was deleted on Discord's side.
			oldEntries.delete(updated.id);
		}

		await this.cache.remove(payload.guild_id, [...oldEntries.keys()]);
		for (const sticker of oldEntries.values()) {
			await this.broker.send({ type: RedisMessageType.StickerDelete, old: sticker.toJSON(), guild_id: payload.guild_id });
		}
	}
}
