/**
 * A row of a legacy table, keyed by its columns (`channels.logs.moderation`).
 */
export type LegacyRow = Record<string, unknown>;

/**
 * A row to insert, keyed by the columns of the table it goes to. Snowflakes stay strings: the database casts them.
 */
export type InsertRow = Record<string, unknown>;

/**
 * Thrown when a value of a legacy row cannot be converted, which fails the whole guild.
 */
export class LegacyValueError extends Error {
	public override readonly name = 'LegacyValueError';

	public constructor(column: string, value: unknown) {
		super(`The column "${column}" holds a value that is not valid: ${JSON.stringify(value)}.`);
	}
}

const Snowflake = /^\d{1,20}$/;

/**
 * Whether a value is the text of a snowflake.
 */
export function isSnowflake(value: unknown): value is string {
	return typeof value === 'string' && Snowflake.test(value);
}

/**
 * Reads a nullable snowflake.
 */
export function readSnowflake(row: LegacyRow, column: string): string | null {
	const value = row[column];
	if (value === null || value === undefined) return null;
	if (!isSnowflake(value)) throw new LegacyValueError(column, value);
	return value;
}

/**
 * Reads a list of snowflakes.
 */
export function readSnowflakes(row: LegacyRow, column: string): string[] {
	const value = row[column];
	if (value === null || value === undefined) return [];
	if (!Array.isArray(value) || !value.every(isSnowflake)) throw new LegacyValueError(column, value);
	return value;
}

/**
 * Reads a list of texts.
 */
export function readTexts(row: LegacyRow, column: string): string[] {
	const value = row[column];
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Writes a `timestamp(6)` of a legacy table as the `timestamp(3)` of the new ones, cut and not rounded, so the text of
 * a date that a hash covers stays the same second.
 */
export function readTimestamp(value: unknown): string | null {
	return typeof value === 'string' ? value.replace('T', ' ').slice(0, 23) : null;
}
