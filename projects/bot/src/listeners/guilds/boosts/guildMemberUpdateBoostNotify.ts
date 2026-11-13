import { getBoostChange, sendBoostLog } from '#lib/moderation/logs/boosts';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Logs a member who starts or stops boosting the server, from the time they boost since (`premium_since`).
 */
@RegisterAsDispatchListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// Without the previous state of the member, a member who boosts may have boosted already:
		if (previous === null || previous.partial) return;

		const change = getBoostChange(previous.premiumSinceTimestamp, next.premiumSinceTimestamp);
		if (change === null) return;

		const user = next.user ?? (await next.fetchUser());
		await sendBoostLog(next.guildId, user, change);
	}
}
