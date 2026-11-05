import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';

/**
 * What the column of a setting holds at most, which the schema of the setting does not always say: a value past it
 * passes the checks of the setting and is refused by the database once the import is confirmed.
 */
export type ColumnLimit = { kind: 'text'; maximum: number } | { kind: 'number'; minimum: number; maximum: number };

/** The settings stored as a `VarChar`, by their property, with its length: of each value, for a list. */
const TextColumnLengths: Readonly<Record<string, number>> = {
	prefix: 10,
	disabledCommands: 32,
	messagesAutoDeleteIgnoredCommands: 32,
	selfmodLinksAllowed: 128,
	selfmodInvitesIgnoredGuilds: 19,
	selfmodFilterRaw: 32
};

const SmallInt: ColumnLimit = { kind: 'number', minimum: -32_768, maximum: 32_767 };
const Int: ColumnLimit = { kind: 'number', minimum: -2_147_483_648, maximum: 2_147_483_647 };

/** The integer settings stored as an `Int`, every other one is a `SmallInt`. */
const IntColumns = new Set(['noMentionSpamTimePeriod']);

/**
 * The limit of the column of a portable setting, `null` when the checks of the setting already hold it to what the
 * column takes.
 *
 * @remarks A test reads the limits out of `prisma/schema.prisma`, so this cannot drift from it.
 */
export function getColumnLimit(key: SchemaKey): ColumnLimit | null {
	const length = TextColumnLengths[key.property];
	if (length !== undefined) return { kind: 'text', maximum: length };

	if (key.type === 'integer') return IntColumns.has(key.property) ? Int : SmallInt;
	// The thresholds are an `Int`, the durations of the punishments a `BigInt`:
	if (key.type === 'timespan' && key.property.endsWith('ThresholdDuration')) return Int;
	return null;
}
