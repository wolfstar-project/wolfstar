import { dehoistMember } from '#lib/moderation/dehoist';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Dehoists a member who joins with a name that lists them above the others, when `moderation.dehoist` is on.
 */
@RegisterAsDispatchListener('guildMemberAdd')
export class UserListener extends EventGatewayListener<'guildMemberAdd'> {
	public async run(member: GuildMember) {
		const user = member.user ?? (await member.fetchUser());
		await dehoistMember(member, user);
	}
}
