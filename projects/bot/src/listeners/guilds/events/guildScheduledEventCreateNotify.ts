import { getScheduledEventLines } from '#lib/moderation/logs/events';
import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildScheduledEvent } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildScheduledEventCreate')
export class UserListener extends EventGatewayListener<'guildScheduledEventCreate'> {
	public async run(event: GuildScheduledEvent) {
		await sendSimpleLog(event.guildId, 'logsEvents', (t) => ({
			color: Colors.Green,
			author: `${event.name} (${event.id})`,
			lines: getScheduledEventLines(t, event),
			footer: t('events/guilds-logs:eventCreate')
		}));
	}
}
