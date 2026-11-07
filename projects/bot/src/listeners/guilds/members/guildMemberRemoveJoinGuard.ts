import { leaveJoinGuardMember } from '#lib/moderation/joinguard/checkpoint';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Marks as left a member who waited at the checkpoint of the join guard and left the guild, so the timeout of their
 * stay never kicks them, should they join again.
 */
@RegisterAsDispatchListener('guildMemberRemove')
export class UserListener extends EventGatewayListener<'guildMemberRemove'> {
	public async run(_member: GuildMember | null, data: GatewayGuildMemberRemoveDispatchData) {
		const guild = await this.container.gatewayClient.guilds.resolve(data.guild_id);
		if (!guild?.available) return;

		try {
			await leaveJoinGuardMember(guild, data.user.id);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not mark ${data.user.id} as left in ${data.guild_id}:`, error);
		}
	}
}
