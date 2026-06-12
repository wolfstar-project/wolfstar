import { BaseScopedManager } from './BaseScopedManager';
import { isNullish } from '@sapphire/utilities';
import type { GatewayGuildEmojisUpdateDispatchData } from 'discord-api-types/v10';
import { Emoji, RedisMessageType } from 'wolfstar-shared';

export class EmojiManager extends BaseScopedManager<Emoji> {
	public async handleUpdate(payload: GatewayGuildEmojisUpdateDispatchData) {
		const oldEntries = await this.cache.entries(payload.guild_id);

		for (const emoji of payload.emojis) {
			const updated = Emoji.fromAPI(emoji);
			const old = oldEntries.get(updated.id);

			if (isNullish(old)) {
				await this.cache.set(payload.guild_id, updated);
				await this.broker.send({ type: RedisMessageType.EmojiCreate, data: emoji, guild_id: payload.guild_id });
			} else if (!updated.equals(old)) {
				await this.cache.set(payload.guild_id, updated);
				await this.broker.send({ type: RedisMessageType.EmojiUpdate, old: old.toJSON(), data: emoji, guild_id: payload.guild_id });
			}

			// Drop processed entries; whatever remains was deleted on Discord's side.
			oldEntries.delete(updated.id);
		}

		await this.cache.remove(payload.guild_id, [...oldEntries.keys()]);
		for (const emoji of oldEntries.values()) {
			await this.broker.send({ type: RedisMessageType.EmojiDelete, old: emoji.toJSON(), guild_id: payload.guild_id });
		}
	}
}
