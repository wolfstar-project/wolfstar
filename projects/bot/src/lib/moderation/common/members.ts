import { container } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Fetches a member to moderate, from the cache first, and from the API when the cached one does not know its user.
 *
 * @remarks
 *
 * A member that was cached from the options of an interaction comes without its user: Discord sends the resolved
 * members of the options apart from their users. Such a member has no ID, and everything that acts on it (`kickable`,
 * `bannable`, its roles, a kick) throws `GuildMemberUserUnknown`, so the member is read again from the API, which
 * gives it with its user and caches it whole.
 *
 * @param guildId - The ID of the guild.
 * @param userId - The ID of the user.
 * @throws What the API throws, an unknown member included.
 */
export async function fetchModerationMember(guildId: Snowflake, userId: Snowflake): Promise<GuildMember> {
	const { members } = container.gatewayClient;
	const member = await members.fetch(guildId, userId);
	if (member.id !== null) return member;

	return members.fetch(guildId, userId, { force: true });
}
