import { RegisterAsDispatchListener } from '#utils/worker';
import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention, userMention } from '@discordjs/formatters';
import { EventGatewayListener } from '@wolfstar/plugin-gateway';
import type { AnyThreadChannel } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('threadCreate')
export class UserListener extends EventGatewayListener<'threadCreate'> {
	public async run(thread: AnyThreadChannel) {
		await sendSimpleLog(thread.guildId, 'logsThreads', (t) => ({
			color: Colors.Green,
			author: `${thread.name} (${thread.id})`,
			lines: [
				t('events/guilds-logs:fieldThread', { value: channelMention(thread.id) }),
				thread.parentId ? t('events/guilds-logs:fieldParent', { value: channelMention(thread.parentId) }) : null,
				thread.ownerId ? t('events/guilds-logs:fieldCreator', { value: userMention(thread.ownerId) }) : null
			],
			footer: t('events/guilds-logs:threadCreate')
		}));
	}
}
