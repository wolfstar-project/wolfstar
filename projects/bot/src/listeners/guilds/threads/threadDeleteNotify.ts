import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { AnyThreadChannel } from '@wolfstar/plugin-gateway';
import type { GatewayThreadDeleteDispatchData } from 'discord-api-types/v10';

@RegisterAsDispatchListener('threadDelete')
export class UserListener extends EventGatewayListener<'threadDelete'> {
	public async run(thread: AnyThreadChannel | null, data: GatewayThreadDeleteDispatchData) {
		await sendSimpleLog(data.guild_id, 'logsThreads', (t) => ({
			color: Colors.Red,
			author: thread === null ? data.id : `${thread.name} (${data.id})`,
			lines: [t('events/guilds-logs:fieldParent', { value: channelMention(data.parent_id) })],
			footer: t('events/guilds-logs:threadDelete')
		}));
	}
}
