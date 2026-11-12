import { seconds } from 'wolfstar-shared';
import { readSettings } from '#lib/database';
import { fetchGuildT, fetchMemberRoleIds, formatRoleMentions } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getLogger, getModeration, getUserMentionWithFlagsString } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, TimestampStyles, time } from '@discordjs/builders';
import { isNullish } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatchData) {
		const settings = await readSettings(guild);
		const targetChannelId = settings.logsMemberRemove;
		if (isNullish(targetChannelId)) return;

		const joinedTimestamp = this.processJoinedTimestamp(member);
		const isModerationAction = await this.isModerationAction(guild, user, joinedTimestamp);

		const t = await fetchGuildT(guild);
		const footer = isModerationAction.kicked
			? t('events/guilds-members:guildMemberKicked')
			: isModerationAction.softbanned
				? t('events/guilds-members:guildMemberSoftBanned')
				: t('events/guilds-members:guildMemberRemove'); // A ban is a member who left, its case says the rest

		// Only a member who left by themselves lists the roles, a ban, a kick or a softban keeps them in its case. The
		// gateway no longer has the roles of the member, they come from the member the cache held:
		const wasModerated = isModerationAction.kicked || isModerationAction.banned || isModerationAction.softbanned;
		const roles = wasModerated ? null : formatRoleMentions(t, await fetchMemberRoleIds(member));
		const logger = await getLogger(guild);
		await logger.send({
			key: 'logsMemberRemove',
			channelId: targetChannelId,
			makeMessage: () => {
				const key =
					joinedTimestamp === -1
						? 'events/guilds-members:guildMemberRemoveDescription'
						: 'events/guilds-members:guildMemberRemoveDescriptionWithJoinedAt';
				const joined = t(key, {
					user: getUserMentionWithFlagsString(user.flags ?? 0, user.id),
					relativeTime: time(seconds.fromMilliseconds(joinedTimestamp), TimestampStyles.RelativeTime)
				});
				const left = t('events/guilds-members:guildMemberRemoveLeft', {
					user: getUserMentionWithFlagsString(user.flags ?? 0, user.id),
					relativeTime: time(seconds.fromMilliseconds(Date.now()), TimestampStyles.RelativeTime)
				});
				const lines: string[] = [joined, left];
				if (roles !== null) lines.push(t('events/guilds-members:guildMemberRemoveRoles', { roles }));
				const description = lines.join('\n');

				return new EmbedBuilder()
					.setColor(Colors.Red)
					.setAuthor(getFullEmbedAuthor(user))
					.setDescription(description)
					.setFooter({ text: footer })
					.setTimestamp();
			}
		});
	}

	private async isModerationAction(
		guild: Guild,
		user: GatewayGuildMemberRemoveDispatchData['user'],
		joinedTimestamp: number
	): Promise<IsModerationAction> {
		const moderation = await getModeration(guild);
		await moderation.waitLock();

		const latestLogForUser = await moderation.fetchLatestRecentEntryForUser(user.id);

		// A case from before the member joined is of an earlier stay (kicked, joined again, and left): it does not tell
		// why they leave now. With no join time to compare, the case is trusted:
		if (latestLogForUser === null || (joinedTimestamp !== -1 && latestLogForUser.createdAt < joinedTimestamp)) {
			return {
				kicked: false,
				banned: false,
				softbanned: false
			};
		}

		return {
			kicked: latestLogForUser.type === TypeVariation.Kick,
			banned: latestLogForUser.type === TypeVariation.Ban,
			softbanned: latestLogForUser.type === TypeVariation.Softban
		};
	}

	private processJoinedTimestamp(member: GuildMember | null) {
		if (member === null) return -1;
		if (member.joinedTimestamp === null) return -1;
		return member.joinedTimestamp;
	}
}

interface IsModerationAction {
	readonly kicked: boolean;
	readonly banned: boolean;
	readonly softbanned: boolean;
}
