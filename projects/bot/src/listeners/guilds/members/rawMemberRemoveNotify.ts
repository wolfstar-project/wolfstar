import { seconds } from 'wolfstar-shared';
import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getLogger, getUserMentionWithFlagsString } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, TimestampStyles, time } from '@discordjs/builders';
import { isNullish } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Logs a member who leaves the server as `User Left`, whatever made them leave: a kick, a ban or a softban is told by
 * its case in `moderation.channel`, with the roles the member had.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatchData) {
		const settings = await readSettings(guild);
		const targetChannelId = settings.logsMemberRemove;
		if (isNullish(targetChannelId)) return;

		const t = await fetchGuildT(guild);
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
					.setFooter({ text: t('events/guilds-members:guildMemberRemove') })
					.setTimestamp();
			}
		});
	}

	private processJoinedTimestamp(member: GuildMember | null) {
		if (member === null) return -1;
		if (member.joinedTimestamp === null) return -1;
		return member.joinedTimestamp;
	}
}
