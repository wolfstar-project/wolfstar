import { readSettings } from '#lib/database';
import { container } from '@wolfstar/http-framework';
import { PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';
import type { ReadonlyGuildData } from 'wolfstar-database';

/**
 * Who asks to review the appeals of a guild: a member, with their roles and their guild-wide permissions.
 */
export interface AppealReviewer {
	userId: Snowflake;
	roleIds: readonly Snowflake[];
	/**
	 * The permissions of the member: the ones Discord computed for an interaction, or the ones read with every role of
	 * the member, `GuildMember#fetchPermissions`, since a role missing from the cache would leave one out.
	 */
	permissions: bigint;
}

/**
 * The settings {@linkcode isAppealManager} reads.
 */
export type AppealManagerSettings = Pick<ReadonlyGuildData, 'appealsManagerRoles' | 'rolesModerator' | 'rolesAdmin'>;

/**
 * Whether a member reviews the appeals: the owner, the moderators (the `rolesModerator` roles, or `Ban Members` when
 * there are none), the administrators (the `rolesAdmin` roles, or `Manage Server` when there are none), and the roles
 * of `appeals.manager-roles` besides them.
 *
 * @param reviewer - The member.
 * @param settings - The settings of the guild.
 * @param ownerId - The owner of the guild, `null` when it is not known.
 */
export function isAppealManager(reviewer: AppealReviewer, settings: AppealManagerSettings, ownerId: Snowflake | null): boolean {
	if (reviewer.userId === ownerId) return true;

	const holds = (roles: readonly Snowflake[]) => roles.some((role) => reviewer.roleIds.includes(role));
	if (holds(settings.appealsManagerRoles)) return true;

	// An administrator has every permission, as Discord reads it:
	const has = (bit: bigint) => (reviewer.permissions & (bit | PermissionFlagsBits.Administrator)) !== 0n;
	const moderator = settings.rolesModerator.length === 0 ? has(PermissionFlagsBits.BanMembers) : holds(settings.rolesModerator);
	const administrator = settings.rolesAdmin.length === 0 ? has(PermissionFlagsBits.ManageGuild) : holds(settings.rolesAdmin);
	return moderator || administrator;
}

/**
 * Whether a user reviews the appeals of a guild, for what has no interaction: the requests of the dashboard. A guild
 * with no moderator role does not leave it open to everybody, as the `moderator` level does.
 *
 * @remarks
 *
 * The owner and the roles decide first, so a manager is not turned away when the permissions cannot be read. Those are
 * read only when a level has no role of its own, with every role of the member, since the cache may lack the one that
 * gives them `Ban Members`.
 *
 * @returns Whether they do, `false` for who is not a member.
 */
export async function hasAppealAccess(guildId: Snowflake, userId: Snowflake) {
	const member = await container.gatewayClient.members.fetch(guildId, userId).catch(() => null);
	if (member === null) return false;

	const guild = await container.gatewayClient.guilds.fetch(guildId).catch(() => null);
	const settings = await readSettings(guildId);
	const ownerId = guild?.ownerId ?? null;
	if (isAppealManager({ userId, roleIds: member.roleIds, permissions: 0n }, settings, ownerId)) return true;
	if (settings.rolesModerator.length > 0 && settings.rolesAdmin.length > 0) return false;

	const permissions = await member.fetchPermissions().catch(() => null);
	if (permissions === null) return false;
	return isAppealManager({ userId, roleIds: member.roleIds, permissions: permissions.bitField }, settings, ownerId);
}

/**
 * Whether the author of an interaction reviews the appeals of its guild, see {@linkcode isAppealManager}. It reads the
 * member and the permissions Discord sent with it, and the owner from the cache, so no request to Discord is made
 * before the interaction is answered: `/appeal` and the buttons of an appeal, which a manager role has to reach as the
 * command has no default member permissions. A guild that is not cached leaves the owner unknown, which loses them
 * nothing: Discord gives the owner every permission.
 *
 * @param interaction - The interaction, with its member.
 */
export async function hasAppealAccessFrom(interaction: {
	guildId: Snowflake;
	member: { user: { id: Snowflake }; roles: readonly Snowflake[]; permissions: string };
}) {
	const { guildId, member } = interaction;
	const reviewer = { userId: member.user.id, roleIds: member.roles, permissions: BigInt(member.permissions) };
	return isAppealManager(reviewer, await readSettings(guildId), await readCachedOwnerId(guildId));
}

/**
 * The owner of a guild, from the cache alone.
 *
 * @returns The ID of the owner, `null` when the guild is not cached or the cache cannot be read.
 */
async function readCachedOwnerId(guildId: Snowflake): Promise<Snowflake | null> {
	const { guilds } = container.gatewayClient;
	try {
		const guild = await guilds.cache.get(guilds.resolveKey(guildId));
		return guild?.ownerId ?? null;
	} catch {
		return null;
	}
}
