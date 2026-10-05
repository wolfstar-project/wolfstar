import { seconds } from '#common';
import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
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

		const isModerationAction = await this.isModerationAction(guild, user);

		const t = await fetchGuildT(guild);
		const footer = isModerationAction.kicked
			? t('events/guilds-members:guildMemberKicked')
			: isModerationAction.banned
				? t('events/guilds-members:guildMemberBanned')
				: isModerationAction.softbanned
					? t('events/guilds-members:guildMemberSoftBanned')
					: t('events/guilds-members:guildMemberRemove');

		const joinedTimestamp = this.processJoinedTimestamp(member);
		const logger = await getLogger(guild);
		await logger.send({
			key: 'logsMemberRemove',
			channelId: targetChannelId,
			makeMessage: () => {
				const key =
					joinedTimestamp === -1
						? 'events/guilds-members:guildMemberRemoveDescription'
						: 'events/guilds-members:guildMemberRemoveDescriptionWithJoinedAt';
				const description = t(key, {
					user: getUserMentionWithFlagsString(user.flags ?? 0, user.id),
					relativeTime: time(seconds.fromMilliseconds(joinedTimestamp), TimestampStyles.RelativeTime)
				});

				return new EmbedBuilder()
					.setColor(Colors.Red)
					.setAuthor(getFullEmbedAuthor(user))
					.setDescription(description)
					.setFooter({ text: footer })
					.setTimestamp();
			}
		});
	}

	private async isModerationAction(guild: Guild, user: GatewayGuildMemberRemoveDispatchData['user']): Promise<IsModerationAction> {
		const moderation = await getModeration(guild);
		await moderation.waitLock();

		const latestLogForUser = moderation.getLatestRecentCachedEntryForUser(user.id);

		if (latestLogForUser === null) {
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
