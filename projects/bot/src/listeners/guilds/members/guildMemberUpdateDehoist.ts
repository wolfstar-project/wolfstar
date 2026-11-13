import { dehoistMember } from '#lib/moderation/dehoist';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Dehoists a member who takes a name that lists them above the others, when `moderation.dehoist` is on: a nickname, or
 * a display name or a username of their own when they have no nickname.
 */
@RegisterAsDispatchListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// A nickname that did not change is still the name the member shows, whatever else the update changed:
		if (previous !== null && !previous.partial && next.nickname !== null && previous.nickname === next.nickname) return;

		const user = next.user ?? (await next.fetchUser());
		await dehoistMember(next, user);
	}
}
