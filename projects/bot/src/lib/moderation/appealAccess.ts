import { readSettings } from '#lib/database';
import { isModerator } from '#utils/functions';
import { container } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';
import type { ReadonlyGuildData } from 'wolfstar-database';

/**
 * Whether a member reviews the appeals: the moderators, and the roles of `appeals.manager-roles` besides them.
 */
export async function isAppealManager(member: GuildMember, settings: Pick<ReadonlyGuildData, 'appealsManagerRoles'>) {
	return settings.appealsManagerRoles.some((role) => member.roleIds.includes(role)) || isModerator(member);
}

/**
 * Whether a user reviews the appeals of a guild. It takes a user ID, not an interaction, for what no permission of a
 * command filters: the requests of the dashboard, and `/appeal` itself, which a manager role has to reach. So a guild
 * with no moderator role does not leave it open to everybody, as the `moderator` level does.
 *
 * @returns Whether they do, `false` for who is not a member.
 */
export async function hasAppealAccess(guildId: Snowflake, userId: Snowflake) {
	const member = await container.gatewayClient.members.fetch(guildId, userId).catch(() => null);
	if (member === null) return false;

	return isAppealManager(member, await readSettings(guildId));
}
