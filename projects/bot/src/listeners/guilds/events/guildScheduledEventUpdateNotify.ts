import { getScheduledEventLines, getScheduledEventStatus } from '#lib/moderation/logs/events';
import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildScheduledEvent } from '@wolfstar/plugin-gateway';

/**
 * Logs the changes of a scheduled event a moderator makes: its name, its time, its place and its status (started,
 * ended, cancelled). The count of the members who are interested is not logged.
 */
@RegisterAsDispatchListener('guildScheduledEventUpdate')
export class UserListener extends EventGatewayListener<'guildScheduledEventUpdate'> {
	public async run(previous: GuildScheduledEvent | null, next: GuildScheduledEvent) {
		if (previous === null) return;

		await sendSimpleLog(next.guildId, 'logsEvents', (t) => {
			const changes = [
				previous.name === next.name ? null : t('events/guilds-logs:fieldRenamed', { previous: previous.name, next: next.name }),
				previous.status === next.status
					? null
					: t('events/guilds-logs:fieldStatus', {
							previous: getScheduledEventStatus(t, previous.status),
							next: getScheduledEventStatus(t, next.status)
						}),
				previous.scheduledStartTimestamp === next.scheduledStartTimestamp &&
				previous.scheduledEndTimestamp === next.scheduledEndTimestamp &&
				previous.channelId === next.channelId &&
				previous.location === next.location
					? null
					: t('events/guilds-logs:eventMoved')
			];
			if (changes.every((line) => line === null)) return null;

			return {
				color: Colors.Yellow,
				author: `${next.name} (${next.id})`,
				lines: [...changes, ...getScheduledEventLines(t, next)],
				footer: t('events/guilds-logs:eventUpdate')
			};
		});
	}
}
