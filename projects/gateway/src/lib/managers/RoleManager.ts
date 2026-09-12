import { BaseScopedManager } from './BaseScopedManager';
import { isNullish } from '@sapphire/utilities';
import type {
	GatewayGuildRoleCreateDispatchData,
	GatewayGuildRoleDeleteDispatchData,
	GatewayGuildRoleUpdateDispatchData
} from 'discord-api-types/v10';
import { RedisMessageType, Role } from 'wolfstar-shared';

export class RoleManager extends BaseScopedManager<Role> {
	public async handleCreate(payload: GatewayGuildRoleCreateDispatchData) {
		await this.cache.set(payload.guild_id, Role.fromAPI(payload.role));
		await this.broker.send({ type: RedisMessageType.RoleCreate, data: payload.role, guild_id: payload.guild_id });
	}

	public async handleUpdate(payload: GatewayGuildRoleUpdateDispatchData) {
		const old = await this.cache.get(payload.guild_id, payload.role.id);
		await this.cache.set(payload.guild_id, Role.fromAPI(payload.role));
		await this.broker.send({ type: RedisMessageType.RoleUpdate, old: old?.toJSON() ?? null, data: payload.role, guild_id: payload.guild_id });
	}

	public async handleDelete(payload: GatewayGuildRoleDeleteDispatchData) {
		const old = await this.cache.get(payload.guild_id, payload.role_id);
		if (isNullish(old)) {
			await this.broker.send({ type: RedisMessageType.RoleDelete, old: { id: payload.role_id }, guild_id: payload.guild_id });
		} else {
			await this.cache.remove(payload.guild_id, old.id);
			await this.broker.send({ type: RedisMessageType.RoleDelete, old: old.toJSON(), guild_id: payload.guild_id });
		}
	}
}
