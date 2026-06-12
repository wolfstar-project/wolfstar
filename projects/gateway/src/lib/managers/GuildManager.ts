import type { REST } from '@discordjs/rest';
import { isNullish } from '@sapphire/utilities';
import {
	Routes,
	type APIGuild,
	type GatewayGuildCreateDispatchData,
	type GatewayGuildDeleteDispatchData,
	type GatewayGuildUpdateDispatchData,
	type Snowflake
} from 'discord-api-types/v10';
import { type Cache, Channel, Emoji, type FetchOptions, Guild, Member, type MessageBroker, RedisMessageType, Role, Sticker } from 'wolfstar-shared';

/**
 * Manager for guilds and their initial bulk-cached collections. Unlike the
 * scoped managers, it spans several caches because a guild owns channels,
 * members, roles, emojis and stickers.
 */
export class GuildManager {
	public constructor(
		public readonly cache: Cache,
		protected readonly broker: MessageBroker,
		protected readonly rest?: REST
	) {}

	public async handleCreate(payload: GatewayGuildCreateDispatchData) {
		await this.cache.guilds.add(payload, true);
		await this.cache.emojis.set(
			payload.id,
			payload.emojis.map((emoji) => Emoji.fromAPI(emoji))
		);
		await this.cache.channels.set(
			payload.id,
			payload.channels.map((entry) => Channel.fromAPI(entry))
		);
		await this.cache.members.set(
			payload.id,
			payload.members.map((entry) => Member.fromAPI(entry))
		);
		await this.cache.roles.set(
			payload.id,
			payload.roles.map((role) => Role.fromAPI(role))
		);
		await this.cache.stickers.set(
			payload.id,
			(payload.stickers ?? []).map((sticker) => Sticker.fromAPI(sticker))
		);
	}

	public async handleUpdate(payload: GatewayGuildUpdateDispatchData) {
		const old = await this.cache.guilds.get(payload.id);
		const data = await this.cache.guilds.add(payload, true);
		await this.broker.send({ type: RedisMessageType.GuildUpdate, old: old?.toJSON() ?? null, data: data.toJSON() });
	}

	public async handleDelete(payload: GatewayGuildDeleteDispatchData) {
		for (const channelId of await this.cache.channels.keys(payload.id)) {
			await this.cache.messages.clear(channelId);
		}
		await this.cache.guilds.remove(payload.id);
	}

	/**
	 * Fetches a guild, hitting the cache first unless `force` is set.
	 */
	public async fetch(guildId: Snowflake, options: FetchOptions = {}): Promise<Guild> {
		const { force = false, cache = true } = options;
		if (!force) {
			const cached = await this.cache.guilds.get(guildId);
			if (!isNullish(cached)) return cached;
		}

		if (isNullish(this.rest)) throw new Error('The REST client is not available to this manager.');
		const data = (await this.rest.get(Routes.guild(guildId))) as APIGuild;
		if (!cache) return Guild.fromAPI(data);
		return this.cache.guilds.add(data, true);
	}
}
