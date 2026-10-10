import { Events } from '#lib/types';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

@RegisterAsGatewayListener('guildMemberRemove')
export class UserListener extends EventGatewayListener<'guildMemberRemove'> {
	public async run(member: GuildMember | null, data: GatewayGuildMemberRemoveDispatchData) {
		const { guilds } = this.container.gatewayClient;
		const guild = await guilds.cache.get(guilds.resolveKey(data.guild_id));
		if (!guild || !guild.available) return;

		this.container.client.emit(Events.RawMemberRemove, guild, member, data);
	}
}
