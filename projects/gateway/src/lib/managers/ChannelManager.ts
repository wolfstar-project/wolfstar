import { BaseScopedManager } from './BaseScopedManager';
import { isNullish } from '@sapphire/utilities';
import { Routes, type APIChannel, type Snowflake } from 'discord-api-types/v10';
import { Channel, type FetchOptions, RedisMessageType } from 'wolfstar-shared';

export class ChannelManager extends BaseScopedManager<Channel> {
	public async handleCreate(guildId: Snowflake, data: APIChannel) {
		await this.cache.set(guildId, Channel.fromAPI(data));
		await this.broker.send({ type: RedisMessageType.ChannelCreate, data });
	}

	public async handleUpdate(guildId: Snowflake, data: APIChannel) {
		const old = (await this.cache.get(guildId, data.id))?.toJSON() ?? null;
		await this.cache.set(guildId, Channel.fromAPI(data));
		await this.broker.send({ type: RedisMessageType.ChannelUpdate, old, data });
	}

	public async handleDelete(guildId: Snowflake, data: APIChannel) {
		await this.cache.remove(guildId, data.id);
		await this.broker.send({ type: RedisMessageType.ChannelDelete, old: data });
	}

	/**
	 * Fetches a channel, hitting the cache first unless `force` is set.
	 */
	public async fetch(guildId: Snowflake, channelId: Snowflake, options: FetchOptions = {}): Promise<Channel> {
		const { force = false, cache = true } = options;
		if (!force) {
			const cached = await this.cache.get(guildId, channelId);
			if (!isNullish(cached)) return cached;
		}

		if (isNullish(this.rest)) throw new Error('The REST client is not available to this manager.');
		const data = (await this.rest.get(Routes.channel(channelId))) as APIChannel;
		if (!cache) return Channel.fromAPI(data);
		return this.cache.add(guildId, data, true);
	}
}
