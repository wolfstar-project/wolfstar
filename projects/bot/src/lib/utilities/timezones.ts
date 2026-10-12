/**
 * The time zone a guild has until it sets one.
 */
export const DefaultTimeZone = 'UTC';

let cachedTimeZones: ReadonlyMap<string, string> | null = null;

/**
 * The time zones of the IANA database the runtime knows, by their name in lowercase. `UTC` is added: it is what a guild
 * has by default, and the list of the runtime leaves it out.
 */
function getTimeZones(): ReadonlyMap<string, string> {
	cachedTimeZones ??= new Map([DefaultTimeZone, ...Intl.supportedValuesOf('timeZone')].map((name) => [name.toLowerCase(), name]));
	return cachedTimeZones;
}

/**
 * Finds a time zone by its name, whatever the case it is written in: `europe/rome` is `Europe/Rome`.
 *
 * @param input - The name of a time zone of the IANA database, such as `Europe/Rome` or `UTC`.
 * @returns The name as the database writes it, `null` when it is not one.
 */
export function resolveTimeZone(input: string): string | null {
	return getTimeZones().get(input.trim().toLowerCase()) ?? null;
}

/**
 * Whether a value is the name of a time zone, written as the IANA database writes it.
 */
export function isTimeZone(value: unknown): value is string {
	return typeof value === 'string' && resolveTimeZone(value) === value;
}
