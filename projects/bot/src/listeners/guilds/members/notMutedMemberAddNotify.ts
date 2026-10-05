import { seconds } from '#common';
import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getLogger, getUserMentionWithFlagsString } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, TimestampStyles, time } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.NotMutedMemberAdd })
export class UserListener extends Listener {
	public async run(member: GuildMember) {
		const settings = await readSettings(member);
		const logChannelId = settings.logsMemberAdd;
		const logger = await getLogger(member);
		await logger.send({
			key: 'logsMemberAdd',
			channelId: logChannelId,
			makeMessage: async () => {
				const t = await fetchGuildT({ id: member.guildId });
				const user = member.user ?? (await member.fetchUser());
				const description = t('events/guilds-members:guildMemberAddDescription', {
					user: getUserMentionWithFlagsString(Number(user.flags.bitField), user.id),
					relativeTime: time(seconds.fromMilliseconds(user.createdTimestamp), TimestampStyles.RelativeTime)
				});
				return new EmbedBuilder()
					.setColor(Colors.Green)
					.setAuthor(getFullEmbedAuthor(user))
					.setDescription(description)
					.setFooter({ text: t('events/guilds-members:guildMemberAdd') })
					.setTimestamp();
			}
		});
	}
}
