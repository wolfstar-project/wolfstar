import { formatGreeting } from '#lib/greetings/format';
import { readRoleMessages } from '#lib/greetings/roleMessages';
import { sendGreeting } from '#lib/greetings/send';
import { getAddedRoles, getRemovedRoles } from '#lib/moderation/common/roleChanges';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Sends the role messages of the server (`/greetings role-set`) when a member gets or loses their role.
 */
@RegisterAsGatewayListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// The roles a member had are only known when it was cached:
		if (previous === null || previous.partial) return;

		const added = getAddedRoles(previous.roleIds, next.roleIds);
		const removed = getRemovedRoles(previous.roleIds, next.roleIds);
		if (added.length === 0 && removed.length === 0) return;

		const messages = await readRoleMessages(next.guildId);
		if (messages.length === 0) return;

		const user = next.user ?? (await next.fetchUser());
		const guild = next.guild ?? (await next.fetchGuild());
		for (const message of messages) {
			const template = added.includes(message.roleId) ? message.added : removed.includes(message.roleId) ? message.removed : null;
			if (template === null) continue;

			try {
				const role = await this.container.gatewayClient.roles.fetch(next.guildId, message.roleId).catch(() => null);
				await sendGreeting(message.channelId, formatGreeting(template, { user, guild, role }), user.id);
			} catch (error) {
				this.container.logger.error(getLogPrefix(this), 'Could not send a role message:', error);
			}
		}
	}
}
