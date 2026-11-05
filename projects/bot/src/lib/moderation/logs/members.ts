import type { Translator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getUserMentionWithFlagsString } from '#utils/functions';
import { getDisplayAvatar, getTag } from '#utils/util';
import { EmbedBuilder, TimestampStyles, time } from '@discordjs/builders';
import type { User } from '@wolfstar/plugin-gateway';
import type { APIUser } from 'discord-api-types/v10';
import { escapeMarkdown } from 'wolfstar-shared';

export type MemberLogEvent =
	| { type: 'joined' | 'mutedJoined'; createdAt: number }
	| { type: 'left' | 'kicked' | 'banned' | 'softbanned'; joinedAt: number | null; roles: string | null };

/** Renders the event first and keeps elapsed membership fixed at the time it happened. */
export function renderMemberEvent(t: Translator, user: User | APIUser, flags: number, event: MemberLogEvent, occurredAt: number) {
	const titles = {
		joined: 'events/guilds-members:guildMemberAdd',
		mutedJoined: 'events/guilds-members:guildMemberAddMute',
		left: 'events/guilds-members:guildMemberRemove',
		kicked: 'events/guilds-members:guildMemberKicked',
		banned: 'events/guilds-members:guildMemberBanned',
		softbanned: 'events/guilds-members:guildMemberSoftBanned'
	} as const;
	const embed = new EmbedBuilder()
		.setColor(event.type === 'joined' ? Colors.Green : event.type === 'mutedJoined' ? Colors.Amber : Colors.Red)
		.setAuthor({ name: t(titles[event.type]), iconURL: getDisplayAvatar(user, { size: 128 }) })
		.setThumbnail(getDisplayAvatar(user, { size: 256 }))
		.setDescription(`${getUserMentionWithFlagsString(flags, user.id)} ${escapeMarkdown(getTag(user))}`)
		.setFooter({ text: `ID: ${user.id}` })
		.setTimestamp(occurredAt);
	const at = (value: number) => time(Math.floor(value / 1000), TimestampStyles.ShortDateTime);
	if ('createdAt' in event) {
		embed.addFields({ name: t('events/guilds-members:accountCreated'), value: at(event.createdAt), inline: true });
		embed.addFields({
			name: t('events/guilds-members:accountAge'),
			value: t('events/guilds-members:memberDuration', { duration: Math.max(0, occurredAt - event.createdAt) } as never),
			inline: true
		});
	} else {
		if (event.joinedAt !== null && Number.isFinite(event.joinedAt) && event.joinedAt > 0 && event.joinedAt <= occurredAt) {
			embed.addFields({ name: t('events/guilds-members:joinedServer'), value: at(event.joinedAt), inline: true });
			embed.addFields({
				name: t('events/guilds-members:timeInServer'),
				value: t('events/guilds-members:memberDuration', { duration: occurredAt - event.joinedAt } as never),
				inline: true
			});
		}
		if (event.roles !== null) embed.addFields({ name: t('events/guilds-members:memberRoles'), value: event.roles });
	}
	return embed;
}
