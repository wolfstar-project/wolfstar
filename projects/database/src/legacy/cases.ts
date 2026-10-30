import { isSnowflake, readTimestamp, type InsertRow, type LegacyRow } from './types.js';

/** The last legacy `TypeVariation`, `Timeout`. */
const MaximumLegacyType = 15;

/** `ModerationAction.duration` is a 32-bit integer of seconds. */
const MaximumDuration = 2 ** 31 - 1;

/**
 * How the bot writes the type and the metadata of a case in `ModerationAction`, which it keeps with its moderation code.
 */
export type LegacyCaseEncoder = (type: number, metadata: number) => { action: string; metadata: number };

export interface LegacyCaseRows {
	case: InsertRow;
	/** What the row of the case has no column for. */
	data: InsertRow | null;
	warnings: string[];
}

function joinReason(reason: unknown, image: unknown) {
	const parts = [reason, image].filter((part) => typeof part === 'string' && part.length > 0);
	return parts.length === 0 ? null : parts.join('\n');
}

/**
 * Converts a row of the legacy `moderation` table, as the bot writes a case.
 *
 * @param row - The row.
 * @param encode - How the bot writes the type and the metadata of a case.
 * @returns The rows of the case, `null` when what makes it a case is missing.
 */
export function convertLegacyCase(row: LegacyRow, encode: LegacyCaseEncoder): LegacyCaseRows | null {
	const createdAt = readTimestamp(row.created_at);
	const type = Number(row.type);
	if (createdAt === null || !Number.isInteger(type) || type < 0 || type > MaximumLegacyType) return null;
	if (!isSnowflake(row.user_id) || !isSnowflake(row.moderator_id)) return null;

	const warnings: string[] = [];
	const seconds = Math.round(Number(row.duration ?? 0) / 1000);
	if (seconds > MaximumDuration) warnings.push(`The duration of the case ${row.case_id} was cut to ${MaximumDuration} seconds.`);

	return {
		case: {
			id: row.case_id,
			guild_id: row.guild_id,
			...encode(type, Number(row.metadata ?? 0)),
			created_at: createdAt,
			duration: Math.min(seconds, MaximumDuration),
			target_id: row.user_id,
			moderator_id: row.moderator_id,
			reason: joinReason(row.reason, row.image_url)
		},
		data:
			row.extra_data === null || row.extra_data === undefined
				? null
				: { case_id: row.case_id, guild_id: row.guild_id, extra_data: row.extra_data },
		warnings
	};
}
