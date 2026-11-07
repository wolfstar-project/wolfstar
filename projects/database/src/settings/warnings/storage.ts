import type { Database } from '../../index.js';
import type { AutoModerationHardAction } from '../types.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most thresholds of warnings a guild has.
 */
export const MaximumWarnThresholds = 10;

/**
 * The actions a threshold of warnings takes, every hard action but another warning, which would count towards itself.
 */
export const WarnThresholdActions = ['Timeout', 'Mute', 'Kick', 'Softban', 'Ban', 'VoiceKick'] as const satisfies readonly AutoModerationHardAction[];
export type WarnThresholdAction = (typeof WarnThresholdActions)[number];

/**
 * What happens to a member who reaches a number of active warnings.
 */
export interface WarnThreshold {
	/** The number of active warnings that triggers it. */
	count: number;
	/** The period the warnings are counted in, in milliseconds; `0` counts every active warning. */
	period: number;
	action: WarnThresholdAction;
	/** How long the action lasts, in milliseconds; `null` for a permanent one. */
	duration: number | null;
}

function isWarnThresholdAction(value: string): value is WarnThresholdAction {
	return (WarnThresholdActions as readonly string[]).includes(value);
}

/**
 * Reads the thresholds of warnings of a guild, by their count.
 * @param db The database to read through.
 * @param guildId The guild's ID.
 */
export async function fetchWarnThresholds(db: Database, guildId: Snowflake): Promise<WarnThreshold[]> {
	const rows = await db.orm.public.GuildWarnThreshold.where({ guildId: BigInt(guildId) }).all();
	return rows
		.filter((row) => isWarnThresholdAction(row.action))
		.map((row) => ({
			count: row.count,
			period: row.period * 1000,
			action: row.action as WarnThresholdAction,
			duration: row.duration === null ? null : row.duration * 1000
		}))
		.sort((a, b) => a.count - b.count);
}

/**
 * Sets the threshold of a number of warnings, replacing the one the guild had for it, and creates the `Guild` row it
 * references when the guild has none yet. The durations are stored in seconds.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The threshold.
 * @param language The language a `Guild` row is created with.
 * @returns Whether it was new.
 */
export async function setWarnThreshold(db: Database, guildId: Snowflake, data: WarnThreshold, language = 'en-US'): Promise<boolean> {
	const id = BigInt(guildId);
	const columns = {
		period: Math.round(data.period / 1000),
		action: data.action,
		duration: data.duration === null ? null : Math.round(data.duration / 1000)
	};

	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const thresholds = tx.orm.public.GuildWarnThreshold;
		const count = await thresholds.where({ guildId: id, count: data.count }).updateAndCount(columns);
		if (Number(count) > 0) return false;

		await thresholds.create({ guildId: id, count: data.count, ...columns });
		return true;
	});
}

/**
 * Removes the threshold of a number of warnings.
 * @returns Whether the guild had it.
 */
export async function deleteWarnThreshold(db: Database, guildId: Snowflake, count: number): Promise<boolean> {
	const deleted = await db.orm.public.GuildWarnThreshold.where({ guildId: BigInt(guildId), count }).deleteAndCount();
	return Number(deleted) > 0;
}
