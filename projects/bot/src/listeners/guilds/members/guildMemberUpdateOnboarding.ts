import { advanceOnboarding, hasCompletedNativeOnboarding } from '#lib/onboarding/members';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Starts the `NativeOnboarding` stage of a member who just completed Discord's own onboarding of the guild (their
 * `CompletedOnboarding` flag), see `lib/onboarding`.
 *
 * @remarks Only an update that turns the flag on is read: the other updates of a member cost nothing. Without the
 * previous state of the member, an update with the flag is read, and finds nothing to start when the stage started
 * already.
 */
@RegisterAsDispatchListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		if (!hasCompletedNativeOnboarding(next)) return;
		if (previous !== null && !previous.partial && hasCompletedNativeOnboarding(previous)) return;

		try {
			await advanceOnboarding(next);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not go on with the onboarding of a member of ${next.guildId}:`, error);
		}
	}
}
