import type { Translator } from '#lib/structures/commands/utils';
import { channelMention, time, TimestampStyles, userMention } from '@discordjs/formatters';
import type { GuildScheduledEvent } from '@wolfstar/plugin-gateway';
import { GuildScheduledEventStatus } from 'discord-api-types/v10';

/**
 * The lines of the log of a scheduled event: when, where and who made it.
 *
 * @param t - The function to translate with.
 * @param event - The event.
 */
export function getScheduledEventLines(t: Translator, event: GuildScheduledEvent): (string | null)[] {
	const at = (timestamp: number) => time(Math.floor(timestamp / 1000), TimestampStyles.LongDateTime);
	return [
		t('events/guilds-logs:fieldStart', { value: at(event.scheduledStartTimestamp) }),
		event.scheduledEndTimestamp === null ? null : t('events/guilds-logs:fieldEnd', { value: at(event.scheduledEndTimestamp) }),
		event.channelId === null ? null : t('events/guilds-logs:fieldChannel', { value: channelMention(event.channelId) }),
		event.location === null ? null : t('events/guilds-logs:fieldLocation', { value: event.location }),
		event.creatorId === null ? null : t('events/guilds-logs:fieldCreator', { value: userMention(event.creatorId) })
	];
}

/**
 * The name of the status of a scheduled event.
 */
export function getScheduledEventStatus(t: Translator, status: GuildScheduledEventStatus): string {
	switch (status) {
		case GuildScheduledEventStatus.Scheduled:
			return t('events/guilds-logs:eventStatusScheduled');
		case GuildScheduledEventStatus.Active:
			return t('events/guilds-logs:eventStatusActive');
		case GuildScheduledEventStatus.Completed:
			return t('events/guilds-logs:eventStatusCompleted');
		case GuildScheduledEventStatus.Canceled:
			return t('events/guilds-logs:eventStatusCanceled');
		default:
			return String(status);
	}
}
