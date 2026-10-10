/**
 * Reads a `TimestampString` column as milliseconds.
 *
 * @remarks The column has no time zone and holds UTC, which is what is written to it (`toISOString()`), but the
 * driver gives it back as `2026-10-08 13:02:18.076`, without a zone: `new Date()` would read that as the local time of
 * the process, and be off by its UTC offset anywhere that is not UTC.
 *
 * @param value - The value of the column.
 */
export function parseTimestamp(value: string): number {
	const text = value.trim();
	// A value that already says its zone is read as it is:
	const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(text);
	return new Date(zoned ? text : `${text.replace(' ', 'T')}Z`).getTime();
}

/**
 * Writes milliseconds as the UTC text a `TimestampString` column takes.
 */
export function formatTimestamp(milliseconds: number): string {
	return new Date(milliseconds).toISOString();
}
