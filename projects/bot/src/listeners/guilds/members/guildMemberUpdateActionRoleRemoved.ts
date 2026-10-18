import { readSettings } from '#lib/database';
import { RoleActions } from '#lib/moderation/actions';
import type { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { fetchRoleChangeExecutor, isRoleActionInCourse } from '#lib/moderation/common/manualRoles';
import { getRemovedRoles, takeOwnRoleChange } from '#lib/moderation/common/roleChanges';
import { fetchGuildT } from '#lib/moderation/common/util';
import { getLogPrefix } from '#utils/functions';
import { isNullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Ends a mute, or a restriction, when its role is taken from the member by hand while it is in course.
 *
 * @remarks
 *
 * A mute takes the roles of the member and keeps them in its case, to give them back when it ends. A moderator who
 * takes the muted role away in Discord left the member with no role at all, and the case in course: its task later
 * undid a mute that was not there, and the member could not be muted again meanwhile.
 *
 * The role that goes is now an unmute: the case that was in course is undone as the command does it (the roles are
 * given back, the task is dropped), in the name of who took the role when the audit log says it. A role the bot took
 * itself is not taken for one, see `markOwnRoleChange`.
 */
@RegisterAsDispatchListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// The roles a member had are only known when it was cached:
		if (isNullish(previous) || previous.partial) return;

		const removed = getRemovedRoles(previous.roleIds, next.roleIds);
		if (removed.length === 0) return;

		const { guildId } = next;
		const user = next.user ?? (await next.fetchUser());
		const userId = user.id;
		const settings = await readSettings(guildId);
		for (const action of RoleActions) {
			const roleId = settings[action.roleKey];
			if (isNullish(roleId) || !removed.includes(roleId)) continue;

			try {
				await this.handle(action, guildId, userId, roleId);
			} catch (error) {
				this.container.logger.error(getLogPrefix(this), 'Could not end the action of a role that was taken by hand:', error);
			}
		}
	}

	private async handle(action: RoleModerationAction, guildId: Snowflake, userId: Snowflake, roleId: Snowflake) {
		// The bot took the role itself, to undo the action:
		if (await takeOwnRoleChange(guildId, userId, roleId)) return;

		const guild = await this.container.gatewayClient.guilds.fetch(guildId);
		if (!(await isRoleActionInCourse(action, guild, userId))) return;

		const executor = await fetchRoleChangeExecutor(guild, userId, roleId, 'remove');
		// The audit log says the bot took it, the mark was just not there anymore:
		if (executor?.userId === process.env.CLIENT_ID) return;

		const t = await fetchGuildT(guild);
		const reason = executor?.reason ?? t('moderationActions:roleRemovedManually');
		const moderator = executor ? await this.container.gatewayClient.users.fetch(executor.userId) : undefined;
		await action.undo(guild, { user: userId, moderator, reason });
		// The undo marked the role as one it takes, and Discord has nothing to say about a role that was gone already:
		await takeOwnRoleChange(guildId, userId, roleId);
	}
}
