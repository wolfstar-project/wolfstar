import { leaveOnboarding } from '#lib/onboarding/members';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Marks as left a member who was in a stage of the onboarding and left the guild, so its time limit never acts on
 * them, should they join again.
 */
@RegisterAsDispatchListener('guildMemberRemove')
export class UserListener extends EventGatewayListener<'guildMemberRemove'> {
	public async run(_member: GuildMember | null, data: GatewayGuildMemberRemoveDispatchData) {
		try {
			await leaveOnboarding(data.guild_id, data.user.id);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not mark ${data.user.id} as left in ${data.guild_id}:`, error);
		}
	}
}
