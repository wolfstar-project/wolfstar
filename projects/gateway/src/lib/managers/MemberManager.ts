import { BaseScopedManager } from './BaseScopedManager';
import { isNullish } from '@sapphire/utilities';
import {
	Routes,
	type APIGuildMember,
	type GatewayGuildMemberAddDispatchData,
	type GatewayGuildMemberRemoveDispatchData,
	type GatewayGuildMembersChunkDispatchData,
	type GatewayGuildMemberUpdateDispatchData,
	type Snowflake
} from 'discord-api-types/v10';
import { type FetchOptions, Member, RedisMessageType } from 'wolfstar-shared';

export class MemberManager extends BaseScopedManager<Member> {
	public async handleAdd(payload: GatewayGuildMemberAddDispatchData) {
		await this.cache.set(payload.guild_id, Member.fromAPI(payload));
		await this.broker.send({ type: RedisMessageType.MemberAdd, data: payload });
	}

	public async handleUpdate(payload: GatewayGuildMemberUpdateDispatchData) {
		const { old, value } = await this.upsert(payload.guild_id, payload);
		await this.broker.send({ type: RedisMessageType.MemberUpdate, old: old?.toJSON() ?? null, data: value.toJSON() });
	}

	public async handleRemove(payload: GatewayGuildMemberRemoveDispatchData) {
		const old = await this.cache.get(payload.guild_id, payload.user.id);
		if (isNullish(old)) {
			await this.broker.send({ type: RedisMessageType.MemberRemove, old: null, user: payload.user, guild_id: payload.guild_id });
		} else {
			await this.cache.remove(payload.guild_id, old.id);
			await this.broker.send({ type: RedisMessageType.MemberRemove, old: old.toJSON(), user: payload.user, guild_id: payload.guild_id });
		}
	}

	public async handleChunk(payload: GatewayGuildMembersChunkDispatchData) {
		await this.cache.set(
			payload.guild_id,
			payload.members.map((data) => Member.fromAPI(data))
		);
	}

	/**
	 * Fetches a member, hitting the cache first unless `force` is set.
	 */
	public async fetch(guildId: Snowflake, userId: Snowflake, options: FetchOptions = {}): Promise<Member> {
		const { force = false, cache = true } = options;
		if (!force) {
			const cached = await this.cache.get(guildId, userId);
			if (!isNullish(cached)) return cached;
		}

		if (isNullish(this.rest)) throw new Error('The REST client is not available to this manager.');
		const data = (await this.rest.get(Routes.guildMember(guildId, userId))) as APIGuildMember;
		if (!cache) return Member.fromAPI(data);
		return this.cache.add(guildId, data, true);
	}
}
