import { readSettings } from '#lib/database';
import { RoleActions } from '#lib/moderation/actions';
import type { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { getRemovedRoles, getUsersInCourse, takeOwnRoleChange } from '#lib/moderation/common/roleChanges';
import { fetchGuildT } from '#lib/moderation/common/util';
import { getLogPrefix, getModeration } from '#utils/functions';
import { isNullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import { AuditLogEvent, PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';

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
@RegisterAsGatewayListener('guildMemberUpdate')
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
		if (!(await this.isInCourse(action, guild, userId))) return;

		const executor = await this.fetchExecutor(guild, userId, roleId);
		// The audit log says the bot took it, the mark was just not there anymore:
		if (executor?.userId === process.env.CLIENT_ID) return;

		const t = await fetchGuildT(guild);
		const reason = executor?.reason ?? t('moderationActions:roleRemovedManually');
		const moderator = executor ? await this.container.gatewayClient.users.fetch(executor.userId) : undefined;
		await action.undo(guild, { user: userId, moderator, reason });
		// The undo marked the role as one it takes, and Discord has nothing to say about a role that was gone already:
		await takeOwnRoleChange(guildId, userId, roleId);
	}

	/**
	 * Whether the latest case of the action of a member is one that is still in course: not its undo, nor one that ended.
	 */
	private async isInCourse(action: RoleModerationAction, guild: Guild, userId: Snowflake) {
		const moderation = await getModeration(guild);
		const entries = await moderation.fetch({ userId });

		return getUsersInCourse(entries.values(), action.type).includes(userId);
	}

	/**
	 * Finds who took the role from the member in the audit log, when the bot can read it.
	 */
	private async fetchExecutor(guild: Guild, userId: Snowflake, roleId: Snowflake) {
		const { gatewayClient } = this.container;
		const me = await gatewayClient.members.me(guild.id);
		if (isNullish(me)) return null;

		const permissions = await me.permissions;
		if (!permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

		const logs = await gatewayClient.api.guilds.getAuditLogs(guild.id, { limit: 10, action_type: AuditLogEvent.MemberRoleUpdate });
		for (const entry of logs.audit_log_entries) {
			if (entry.target_id !== userId || isNullish(entry.user_id)) continue;

			const took = (entry.changes ?? []).some(
				(change) => change.key === '$remove' && (change.new_value ?? []).some((role: { id: Snowflake }) => role.id === roleId)
			);
			if (took) return { userId: entry.user_id, reason: entry.reason ?? null };
		}

		return null;
	}
}
