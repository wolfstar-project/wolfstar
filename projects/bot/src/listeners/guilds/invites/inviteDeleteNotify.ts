import { RegisterAsDispatchListener } from '#utils/worker';
import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention } from '@discordjs/formatters';
import { EventGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildInvite } from '@wolfstar/plugin-gateway';
import type { GatewayInviteDeleteDispatchData } from 'discord-api-types/v10';

@RegisterAsDispatchListener('inviteDelete')
export class UserListener extends EventGatewayListener<'inviteDelete'> {
	public async run(_invite: GuildInvite | null, data: GatewayInviteDeleteDispatchData) {
		if (!data.guild_id) return;

		await sendSimpleLog(data.guild_id, 'logsInvites', (t) => ({
			color: Colors.Red,
			author: data.code,
			lines: [t('events/guilds-logs:fieldChannel', { value: channelMention(data.channel_id) })],
			footer: t('events/guilds-logs:inviteDelete')
		}));
	}
}
