import type { Parameter, TypedFT } from '#types';
import { seconds, Time } from '#utils/common';
import { err, ok, type Result } from '@sapphire/result';

export function resolveTimeSpan(parameter: string, options?: TimeSpanOptions): Result<number, TypedFT<Parameter>> {
	const duration = parse(parameter);

	if (!Number.isSafeInteger(duration)) {
		return err('arguments:timeSpan');
	}

	if (typeof options?.minimum === 'number' && duration < options.minimum) {
		return err('arguments:timeSpanTooSmall');
	}

	if (typeof options?.maximum === 'number' && duration > options.maximum) {
		return err('arguments:timeSpanTooBig');
	}

	return ok(duration);
}

function parse(parameter: string) {
	const number = Number(parameter);
	if (!Number.isNaN(number)) return seconds(number);

	const duration = parseDuration(parameter);
	if (!Number.isNaN(duration)) return duration;

	const date = Date.parse(parameter);
	if (!Number.isNaN(date)) return date - Date.now();

	return Number.NaN;
}

const DurationUnits = new Map<string, number>([
	['ms', Time.Millisecond],
	['msec', Time.Millisecond],
	['msecs', Time.Millisecond],
	['millisecond', Time.Millisecond],
	['milliseconds', Time.Millisecond],
	['s', Time.Second],
	['sec', Time.Second],
	['secs', Time.Second],
	['second', Time.Second],
	['seconds', Time.Second],
	['m', Time.Minute],
	['min', Time.Minute],
	['mins', Time.Minute],
	['minute', Time.Minute],
	['minutes', Time.Minute],
	['h', Time.Hour],
	['hr', Time.Hour],
	['hrs', Time.Hour],
	['hour', Time.Hour],
	['hours', Time.Hour],
	['d', Time.Day],
	['day', Time.Day],
	['days', Time.Day],
	['w', Time.Day * 7],
	['wk', Time.Day * 7],
	['wks', Time.Day * 7],
	['week', Time.Day * 7],
	['weeks', Time.Day * 7],
	['mo', Time.Month],
	['mos', Time.Month],
	['month', Time.Month],
	['months', Time.Month],
	['y', Time.Year],
	['yr', Time.Year],
	['yrs', Time.Year],
	['year', Time.Year],
	['years', Time.Year]
]);

const DurationPattern = /(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*([a-z]*)/gy;

/**
 * Parses a duration written as a list of `<number><unit>` pairs, such as `1h30m`, `2 days` or `1.5h`.
 * @param input The text to parse.
 * @returns The duration in milliseconds, or `NaN` when the text is not a valid duration.
 */
function parseDuration(input: string): number {
	const text = input
		.toLowerCase()
		.replaceAll(',', '')
		.replaceAll(/\band\b/g, ' ')
		.trim();
	if (text.length === 0) return Number.NaN;

	let total = 0;
	let end = 0;
	DurationPattern.lastIndex = 0;
	for (let match = DurationPattern.exec(text); match !== null; match = DurationPattern.exec(text)) {
		const unit = DurationUnits.get(match[2]);
		if (unit === undefined) return Number.NaN;

		total += Number.parseFloat(match[1]) * unit;
		end = DurationPattern.lastIndex;
		// Units can be separated by whitespace:
		while (text[end] === ' ') end++;
		DurationPattern.lastIndex = end;
	}

	return end === text.length ? Math.round(total) : Number.NaN;
}

export interface TimeSpanOptions {
	minimum?: number;
	maximum?: number;
}
