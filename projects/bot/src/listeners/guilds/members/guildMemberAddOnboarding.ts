import { advanceOnboarding } from '#lib/onboarding/members';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Starts the onboarding of a member who joins: the first enabled stage starts when its trigger is `Join`, see
 * `lib/onboarding`. A member who joins again starts again, the rows of an earlier stay say nothing about this one.
 */
@RegisterAsDispatchListener('guildMemberAdd')
export class UserListener extends EventGatewayListener<'guildMemberAdd'> {
	public async run(member: GuildMember) {
		try {
			await advanceOnboarding(member);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not start the onboarding of a member who joined ${member.guildId}:`, error);
		}
	}
}
