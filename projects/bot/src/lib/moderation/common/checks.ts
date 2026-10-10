import type { Translator } from '#lib/structures/commands/utils';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

export interface CheckTargetCanBeModeratedOptions {
	/**
	 * The function to translate with, in the language of the moderator.
	 */
	t: Translator;
	guild: Guild;
	targetId: Snowflake;
	moderatorId: Snowflake;

	/**
	 * Whether the action needs the target to be a member of the guild.
	 */
	requiredMember: boolean;
}

/**
 * Checks whether a user can be moderated by a moderator and by the bot: nobody moderates themselves, the owner of the
 * guild or the bot, nor a member whose highest role is not below theirs.
 *
 * @returns The member of the guild the target resolved to, or `null` if the target is not in the guild.
 * @throws The translated reason why the target cannot be moderated.
 */
export async function checkTargetCanBeModerated(options: CheckTargetCanBeModeratedOptions): Promise<GuildMember | null> {
	const { t, guild, targetId, moderatorId } = options;
	if (targetId === moderatorId) {
		throw t('moderation:actionTargetSelf');
	}

	if (targetId === guild.ownerId) {
		throw t('moderation:actionTargetGuildOwner');
	}

	if (targetId === container.gatewayClient.user?.id) {
		throw t('moderation:actionTargetWolf');
	}

	const { members } = container.gatewayClient;
	const member = await members.fetch(guild.id, targetId).catch(() => {
		if (options.requiredMember) throw t('errors:userNotInGuild');
		return null;
	});

	if (member) {
		const targetHighestRolePosition = await getHighestRolePosition(member);

		// Wolf cannot moderate members with higher role position than her:
		const me = await members.fetchMe(guild.id);
		if (targetHighestRolePosition >= (await getHighestRolePosition(me))) {
			throw t('moderation:actionTargetHigherHierarchyWolf');
		}

		// A member who isn't a server owner is not allowed to moderate somebody with higher role than them:
		if (moderatorId !== guild.ownerId) {
			const author = await members.fetch(guild.id, moderatorId);
			if (targetHighestRolePosition >= (await getHighestRolePosition(author))) {
				throw t('moderation:actionTargetHigherHierarchyAuthor');
			}
		}
	}

	return member;
}

/**
 * Resolves the position of the highest role of a member, `0` (the position of `@everyone`) when they have none.
 *
 * @param member - The member to get the highest role position of.
 */
async function getHighestRolePosition(member: GuildMember) {
	const role = await member.roles.highest;
	return role?.position ?? 0;
}
