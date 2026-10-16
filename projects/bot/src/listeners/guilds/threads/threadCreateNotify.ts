import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention, userMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { AnyThreadChannel } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('threadCreate')
export class UserListener extends EventGatewayListener<'threadCreate'> {
	public async run(thread: AnyThreadChannel) {
		await sendSimpleLog(thread.guildId, 'logsThreads', (t) => ({
			color: Colors.Green,
			author: `${thread.name} (${thread.id})`,
			lines: [
				t('events/guilds-logs:fieldThread', { value: channelMention(thread.id) }),
				thread.parentId === null ? null : t('events/guilds-logs:fieldParent', { value: channelMention(thread.parentId) }),
				thread.ownerId === null ? null : t('events/guilds-logs:fieldCreator', { value: userMention(thread.ownerId) })
			],
			footer: t('events/guilds-logs:threadCreate')
		}));
	}
}
