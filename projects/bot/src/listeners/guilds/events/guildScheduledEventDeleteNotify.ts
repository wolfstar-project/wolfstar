import { RegisterAsDispatchListener } from '#utils/worker';
import { getScheduledEventLines } from '#lib/moderation/logs/events';
import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildScheduledEvent } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('guildScheduledEventDelete')
export class UserListener extends EventGatewayListener<'guildScheduledEventDelete'> {
	public async run(event: GuildScheduledEvent) {
		await sendSimpleLog(event.guildId, 'logsEvents', (t) => ({
			color: Colors.Red,
			author: `${event.name} (${event.id})`,
			lines: getScheduledEventLines(t, event),
			footer: t('events/guilds-logs:eventDelete')
		}));
	}
}
