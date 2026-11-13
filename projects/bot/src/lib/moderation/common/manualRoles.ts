import { getModeration } from '#utils/functions';
import { getUsersInCourse } from '#lib/moderation/common/roleChanges';
import type { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { AuditLogEvent, PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';

/**
 * How long, in milliseconds, the audit log is given to hold the entry of a change, which Discord may write after it
 * tells the bot about the change.
 */
const AuditLogRetryDelay = 1500;

/**
 * Whether the latest case of the action of a member is one that is still in course: not its undo, nor one that ended.
 *
 * @param action - The action of the role.
 * @param guild - The guild of the member.
 * @param userId - The ID of the member.
 */
export async function isRoleActionInCourse(action: RoleModerationAction, guild: Guild, userId: Snowflake): Promise<boolean> {
	const moderation = await getModeration(guild);
	const entries = await moderation.fetch({ userId });

	return getUsersInCourse(entries.values(), action.type).includes(userId);
}

/**
 * Finds who gave a role to a member, or took it from them, in the audit log.
 *
 * @remarks Without `View Audit Log`, or when the entry is not there, it gives `null`. The entry is looked for twice, a
 * moment apart, since Discord may tell the bot about the change before it writes it.
 *
 * @param guild - The guild of the member.
 * @param userId - The ID of the member.
 * @param roleId - The ID of the role.
 * @param change - Whether the role was given (`add`) or taken (`remove`).
 */
export async function fetchRoleChangeExecutor(guild: Guild, userId: Snowflake, roleId: Snowflake, change: 'add' | 'remove') {
	const { gatewayClient } = container;
	const me = await gatewayClient.members.me(guild.id);
	if (isNullish(me)) return null;

	const permissions = await me.permissions;
	if (!permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

	const key = change === 'add' ? '$add' : '$remove';
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, AuditLogRetryDelay));

		const logs = await gatewayClient.api.guilds.getAuditLogs(guild.id, { limit: 10, action_type: AuditLogEvent.MemberRoleUpdate });
		for (const entry of logs.audit_log_entries) {
			if (entry.target_id !== userId || isNullish(entry.user_id)) continue;

			const changed = (entry.changes ?? []).some(
				(item) => item.key === key && (item.new_value ?? []).some((role: { id: Snowflake }) => role.id === roleId)
			);
			if (changed) return { userId: entry.user_id, reason: entry.reason ?? null };
		}
	}

	return null;
}
