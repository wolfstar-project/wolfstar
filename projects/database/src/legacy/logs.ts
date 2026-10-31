import { isSnowflake, readTimestamp, type InsertRow, type LegacyRow } from './types.js';

function snowflakeOrNull(value: unknown) {
	return isSnowflake(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts a row of the legacy `audit_event` table. Every field stays, `hash` and `prev_hash` first of all, since they
 * are a chain. The new columns are `BigInt`: an author that is not a number is `0`, a target or a tenant that is not one
 * is empty, and the original stays in the context.
 *
 * @param row - The row.
 */
export function convertLegacyAuditEvent(row: LegacyRow): InsertRow {
	const originals = {
		...(!isSnowflake(row.actor_id) && { legacyActorId: row.actor_id }),
		...(row.target_id !== null && !isSnowflake(row.target_id) && { legacyTargetId: row.target_id }),
		...(row.tenant_id !== null && !isSnowflake(row.tenant_id) && { legacyTenantId: row.tenant_id })
	};
	const changed = Object.keys(originals).length > 0;

	return {
		...row,
		actor_id: isSnowflake(row.actor_id) ? row.actor_id : '0',
		target_id: snowflakeOrNull(row.target_id),
		tenant_id: snowflakeOrNull(row.tenant_id),
		timestamp: readTimestamp(row.timestamp),
		context: changed ? { ...(isRecord(row.context) ? row.context : {}), ...originals } : row.context
	};
}

/**
 * Converts a row of the legacy `command_log` table.
 *
 * @param row - The row.
 * @returns The row to insert, `null` when it does not name a guild and a user.
 */
export function convertLegacyCommandLog(row: LegacyRow): InsertRow | null {
	if (!isSnowflake(row.guild_id) || !isSnowflake(row.user_id)) return null;

	return {
		...row,
		command_id: snowflakeOrNull(row.command_id),
		channel_id: snowflakeOrNull(row.channel_id),
		executed_at: readTimestamp(row.executed_at)
	};
}

/**
 * Converts a row of the legacy `user` table.
 *
 * @param row - The row.
 * @returns The row to insert, `null` when its ID is not a snowflake.
 */
export function convertLegacyUser(row: LegacyRow): InsertRow | null {
	return isSnowflake(row.id) ? { id: row.id, report: row.moderation_dm } : null;
}
