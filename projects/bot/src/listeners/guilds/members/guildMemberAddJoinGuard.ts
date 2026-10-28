import { guardJoiningMember } from '#lib/moderation/joinguard/join';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Checks a member who joins against the rules of the join guard of the guild, see `lib/moderation/joinguard`.
 */
@RegisterAsDispatchListener('guildMemberAdd')
export class UserListener extends EventGatewayListener<'guildMemberAdd'> {
	public async run(member: GuildMember) {
		try {
			await guardJoiningMember(member);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not check a member who joined ${member.guildId}:`, error);
		}
	}
}
