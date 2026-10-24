import type { ReadonlyGuildData } from 'wolfstar-database';

type StickyRoleSettings = Pick<
	ReadonlyGuildData,
	| 'modulesRoles'
	| 'rolesMuted'
	| 'rolesRestrictedReaction'
	| 'rolesRestrictedEmbed'
	| 'rolesRestrictedEmoji'
	| 'rolesRestrictedAttachment'
	| 'rolesRestrictedVoice'
>;

/**
 * Picks the sticky roles a member who joins again is given back.
 *
 * @remarks
 *
 * Giving the sticky roles back is of the roles module (`modules.roles`), so a server that turned it off gives none of
 * them, but the role of a mute or a restriction: that one is how a moderation action is kept on a member who leaves and
 * joins again, and dropping it would let them out of it.
 *
 * @param settings - The settings of the server.
 * @param stickyRoles - The sticky roles of the member.
 */
export function getRestoredStickyRoles(settings: StickyRoleSettings, stickyRoles: readonly string[]): readonly string[] {
	if (settings.modulesRoles) return stickyRoles;

	const moderationRoles = new Set([
		settings.rolesMuted,
		settings.rolesRestrictedReaction,
		settings.rolesRestrictedEmbed,
		settings.rolesRestrictedEmoji,
		settings.rolesRestrictedAttachment,
		settings.rolesRestrictedVoice
	]);
	return stickyRoles.filter((roleId) => moderationRoles.has(roleId));
}
