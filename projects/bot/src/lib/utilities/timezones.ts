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

/**
 * The time zones the settings menu offers in its select menus, in groups of the 25 values a select menu holds, since a
 * modal has five of them and the database has some 400 zones. A server whose zone is not one of these sets it from the
 * dashboard, and keeps it when the menu is used for something else.
 */
export const TimeZoneGroups = {
	americas: [
		'America/Anchorage',
		'America/Los_Angeles',
		'America/Vancouver',
		'America/Phoenix',
		'America/Denver',
		'America/Edmonton',
		'America/Chicago',
		'America/Winnipeg',
		'America/Mexico_City',
		'America/Guatemala',
		'America/New_York',
		'America/Toronto',
		'America/Havana',
		'America/Panama',
		'America/Bogota',
		'America/Lima',
		'America/Caracas',
		'America/Halifax',
		'America/Puerto_Rico',
		'America/Santiago',
		'America/La_Paz',
		'America/St_Johns',
		'America/Sao_Paulo',
		'America/Argentina/Buenos_Aires',
		'America/Montevideo'
	],
	europe: [
		'Europe/London',
		'Europe/Dublin',
		'Europe/Lisbon',
		'Europe/Madrid',
		'Europe/Paris',
		'Europe/Brussels',
		'Europe/Amsterdam',
		'Europe/Berlin',
		'Europe/Rome',
		'Europe/Zurich',
		'Europe/Vienna',
		'Europe/Prague',
		'Europe/Warsaw',
		'Europe/Budapest',
		'Europe/Stockholm',
		'Europe/Oslo',
		'Europe/Copenhagen',
		'Europe/Helsinki',
		'Europe/Athens',
		'Europe/Bucharest',
		'Europe/Sofia',
		'Europe/Kyiv',
		'Europe/Istanbul',
		'Europe/Moscow',
		'Europe/Minsk'
	],
	africa: [
		'Africa/Casablanca',
		'Africa/Algiers',
		'Africa/Tunis',
		'Africa/Tripoli',
		'Africa/Cairo',
		'Africa/Lagos',
		'Africa/Accra',
		'Africa/Abidjan',
		'Africa/Dakar',
		'Africa/Kinshasa',
		'Africa/Luanda',
		'Africa/Johannesburg',
		'Africa/Maputo',
		'Africa/Harare',
		'Africa/Nairobi',
		'Africa/Addis_Ababa',
		'Africa/Dar_es_Salaam',
		'Africa/Khartoum',
		'Asia/Jerusalem',
		'Asia/Beirut',
		'Asia/Amman',
		'Asia/Baghdad',
		'Asia/Riyadh',
		'Asia/Dubai',
		'Asia/Tehran'
	],
	asia: [
		'Asia/Karachi',
		'Asia/Tashkent',
		'Asia/Kolkata',
		'Asia/Kathmandu',
		'Asia/Dhaka',
		'Asia/Colombo',
		'Asia/Yangon',
		'Asia/Bangkok',
		'Asia/Ho_Chi_Minh',
		'Asia/Jakarta',
		'Asia/Kuala_Lumpur',
		'Asia/Singapore',
		'Asia/Manila',
		'Asia/Hong_Kong',
		'Asia/Shanghai',
		'Asia/Taipei',
		'Asia/Seoul',
		'Asia/Tokyo',
		'Asia/Kabul',
		'Asia/Almaty',
		'Asia/Yekaterinburg',
		'Asia/Novosibirsk',
		'Asia/Krasnoyarsk',
		'Asia/Irkutsk',
		'Asia/Vladivostok'
	],
	pacific: [
		'UTC',
		'Pacific/Honolulu',
		'Pacific/Auckland',
		'Pacific/Fiji',
		'Pacific/Guam',
		'Pacific/Port_Moresby',
		'Pacific/Tongatapu',
		'Pacific/Apia',
		'Pacific/Pago_Pago',
		'Pacific/Noumea',
		'Pacific/Kiritimati',
		'Pacific/Chatham',
		'Australia/Perth',
		'Australia/Darwin',
		'Australia/Adelaide',
		'Australia/Brisbane',
		'Australia/Sydney',
		'Australia/Melbourne',
		'Australia/Hobart',
		'Atlantic/Reykjavik',
		'Atlantic/Azores',
		'Atlantic/Cape_Verde',
		'America/Nuuk',
		'Indian/Maldives',
		'Indian/Mauritius'
	]
} as const satisfies Record<string, readonly string[]>;

export type TimeZoneGroup = keyof typeof TimeZoneGroups;

/**
 * The names the runtime may list a time zone of the groups under instead, since the list of the IANA database it was
 * built with is older or newer than the one the groups are written after (`Europe/Kyiv` was `Europe/Kiev`).
 */
const TimeZoneAliases: Readonly<Record<string, string>> = {
	'America/Argentina/Buenos_Aires': 'America/Buenos_Aires',
	'America/Nuuk': 'America/Godthab',
	'Asia/Ho_Chi_Minh': 'Asia/Saigon',
	'Asia/Kathmandu': 'Asia/Katmandu',
	'Asia/Kolkata': 'Asia/Calcutta',
	'Asia/Yangon': 'Asia/Rangoon',
	'Europe/Kyiv': 'Europe/Kiev'
};

/**
 * The zones of a group as the runtime lists them, so what is picked is a value the `timezone` serializer accepts.
 *
 * @param group - The group of time zones.
 * @returns For each zone its name in the group, to show, and its name in the runtime, to store.
 */
export function getTimeZoneChoices(group: TimeZoneGroup): { label: string; value: string }[] {
	const choices: { label: string; value: string }[] = [];
	for (const zone of TimeZoneGroups[group]) {
		const value = resolveTimeZone(zone) ?? resolveTimeZone(TimeZoneAliases[zone] ?? '');
		if (value !== null) choices.push({ label: zone, value });
	}

	return choices;
}

/**
 * The offset of a time zone from UTC right now, `UTC+02:00` for `Europe/Rome` in summer.
 *
 * @param zone - The name of a time zone of the IANA database.
 * @param date - The moment to read the offset at, now by default.
 */
export function getTimeZoneOffset(zone: string, date = new Date()): string {
	const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
		.formatToParts(date)
		.find((entry) => entry.type === 'timeZoneName');
	const value = part?.value ?? 'GMT';
	return value === 'GMT' ? 'UTC+00:00' : value.replace('GMT', 'UTC');
}
