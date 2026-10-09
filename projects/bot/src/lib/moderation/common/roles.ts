import { TypeVariation } from '#utils/moderationConstants';
import { roleMention } from '@discordjs/builders';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most characters the roles of a member take in a message, which leaves room for the rest of the embed.
 */
export const MaximumRolesLength = 1000;

/**
 * The room left for the count of the roles that did not fit, `and 12 more`.
 */
const OmittedRolesReserve = 30;

/**
 * The types of case that show the roles the member had, since the member is gone once they are taken.
 */
export const RolesCaseTypes: ReadonlySet<TypeVariation> = new Set([TypeVariation.Ban, TypeVariation.Softban, TypeVariation.Kick]);

/**
 * Reads the roles a member has, highest first, leaving out `@everyone` and the roles an integration manages: neither
 * can be given back by hand.
 *
 * @remarks
 *
 * It has to be called while the member is still known: the gateway no longer has the roles of a member who left, so
 * they are read from the member the cache held.
 *
 * @param member - The member, `null` when it was not cached.
 * @returns The IDs of the roles, empty when the member or its roles are not known.
 */
export async function fetchMemberRoleIds(member: GuildMember | null | undefined): Promise<Snowflake[]> {
	if (!member || member.partial) return [];

	try {
		const roles = await member.roles.fetch();
		return roles
			.filter((role) => role.id !== member.guildId && !role.managed)
			.sort((a, b) => b.position - a.position)
			.map((role) => role.id);
	} catch (error) {
		container.logger.debug(`[MODERATION] Could not read the roles of the member ${member.id} of ${member.guildId}:`, error);
		return [];
	}
}

/**
 * Reads the roles of a member of a guild from the cache, see {@linkcode fetchMemberRoleIds}.
 *
 * @param guild - The guild of the member.
 * @param userId - The ID of the user.
 */
export async function fetchCachedMemberRoleIds(guild: Guild, userId: Snowflake): Promise<Snowflake[]> {
	const { members } = container.gatewayClient;
	return fetchMemberRoleIds(await members.cache.get(members.resolveKey(guild.id, userId)));
}

/**
 * Mentions as many roles as fit in a message.
 *
 * @param roleIds - The IDs of the roles.
 * @param maximumLength - The most characters the mentions may take.
 * @returns The mentions that fit and the count of the roles left out.
 */
export function cutRoleMentions(roleIds: readonly Snowflake[], maximumLength = MaximumRolesLength) {
	const mentions = roleIds.map((id) => roleMention(id));
	const total = mentions.reduce((length, mention) => length + mention.length, 0) + Math.max(0, mentions.length - 1);
	if (total <= maximumLength) return { mentions, omitted: 0 };

	const kept: string[] = [];
	let length = 0;
	for (const mention of mentions) {
		const next = length + mention.length + (kept.length === 0 ? 0 : 1);
		if (next > maximumLength - OmittedRolesReserve) break;

		kept.push(mention);
		length = next;
	}

	return { mentions: kept, omitted: mentions.length - kept.length };
}

/**
 * Formats the roles of a member as mentions, cut with a count of the ones left out when they are too many for a message.
 *
 * @param t - The translation function of the guild.
 * @param roleIds - The IDs of the roles.
 * @returns The text, `null` when there are no roles.
 */
export function formatRoleMentions(t: TFunction<AnyNamespace>, roleIds: readonly Snowflake[]): string | null {
	if (roleIds.length === 0) return null;

	const { mentions, omitted } = cutRoleMentions(roleIds);
	const text = mentions.join(' ');
	return omitted === 0 ? text : `${text} ${t('moderation:rolesOmitted', { count: omitted })}`.trim();
}
