import { seconds } from '#utils/common';

export const SecondsOptions = ['s', 'sec', 'secs', 'second', 'seconds'] as const;
export const MinutesOptions = ['m', 'min', 'mins', 'minute', 'minutes'] as const;
export const HoursOptions = ['h', 'hr', 'hrs', 'hour', 'hours'] as const;
export const DaysOptions = ['d', 'day', 'days'] as const;
export const TimeOptions = [...SecondsOptions, ...MinutesOptions, ...HoursOptions, ...DaysOptions] as const;

const maximum = seconds.fromDays(7);

/**
 * The time components of a duration, each one optional. Commands expose them as integer options.
 */
export interface TimeComponents {
	seconds?: number | null | undefined;
	minutes?: number | null | undefined;
	hours?: number | null | undefined;
	days?: number | null | undefined;
}

/**
 * Sums the time components into a number of seconds, capped to 7 days, which is the maximum Discord allows for deleting the
 * message history of a banned user.
 *
 * This is the interaction-based counterpart of `getSeconds(args)`, which read the `--seconds`, `--minutes`, `--hours` and
 * `--days` flags of a message command, each command option maps to one field.
 * @param components The time components, as read from the command options.
 */
export function getSeconds(components: TimeComponents) {
	const result =
		getUnit(components.seconds) +
		getUnit(components.minutes, seconds.fromMinutes) +
		getUnit(components.hours, seconds.fromHours) +
		getUnit(components.days, seconds.fromDays);
	return Math.min(result, maximum);
}

function getUnit(value: number | null | undefined, cb?: (value: number) => number) {
	if (value === null || value === undefined) return 0;
	return Number.isInteger(value) ? (cb ? cb(value) : value) : 0;
}
