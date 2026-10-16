import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildInvite } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('inviteCreate')
export class UserListener extends EventGatewayListener<'inviteCreate'> {
	public async run(invite: GuildInvite) {
		if (invite.guildId === null) return;

		await sendSimpleLog(invite.guildId, 'logsInvites', (t) => ({
			color: Colors.Green,
			author: invite.code,
			lines: [
				invite.inviterId === null ? null : t('events/guilds-logs:fieldCreator', { value: userMention(invite.inviterId) }),
				invite.channelId === null ? null : t('events/guilds-logs:fieldChannel', { value: channelMention(invite.channelId) }),
				invite.maxUses ? t('events/guilds-logs:fieldMaxUses', { value: invite.maxUses }) : null,
				invite.expiresTimestamp === null
					? t('events/guilds-logs:fieldExpiresNever')
					: t('events/guilds-logs:fieldExpires', { value: time(Math.floor(invite.expiresTimestamp / 1000), TimestampStyles.RelativeTime) })
			],
			footer: t('events/guilds-logs:inviteCreate')
		}));
	}
}
