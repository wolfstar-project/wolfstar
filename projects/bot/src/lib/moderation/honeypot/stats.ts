import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The Redis hash the catches of every honeypot are counted in, by guild, and the prefix of the keys of the catches of
 * each day (`wolfstar:honeypot:catches:<guildId>:<day>`), which live {@linkcode DailyKeyLifetime} seconds.
 */
const CatchesHash = 'wolfstar:honeypot:catches';
const DailyKeyLifetime = 8 * 86_400;

/**
 * How many days the recent catches are counted over.
 */
export const RecentCatchesDays = 7;

/**
 * What this process counted while Redis could not be asked: the totals by guild, and the catches of each day.
 */
const localTotals = new Map<Snowflake, number>();
const localDays = new Map<string, number>();

/**
 * How many members the honeypot of a guild caught.
 */
export interface HoneypotStats {
	/** Since the honeypot was set up, whatever channel it was in. */
	total: number;
	/** In the last {@linkcode RecentCatchesDays} days. */
	recent: number;
}

/**
 * The key of the catches of a day, `YYYY-MM-DD` in UTC.
 */
export function getCatchDayKey(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

/**
 * The keys of the last {@linkcode RecentCatchesDays} days, today included.
 */
export function getRecentCatchDayKeys(now = new Date()): string[] {
	return Array.from({ length: RecentCatchesDays }, (_, index) => getCatchDayKey(new Date(now.getTime() - index * 86_400_000)));
}

/**
 * Counts a member the honeypot caught: one more in the total of the guild, and in the catches of the day. Without a
 * ready connection the process counts for itself, which the warning of the channel then shows until Redis is back.
 *
 * @returns The total of the guild after this one.
 */
export async function countHoneypotCatch(guildId: Snowflake, now = new Date()): Promise<number> {
	const day = getCatchDayKey(now);
	const { redis } = container;
	if (redis?.status === 'ready') {
		try {
			const dailyKey = `${CatchesHash}:${guildId}:${day}`;
			const [total] = await Promise.all([
				redis.hincrby(CatchesHash, guildId, 1),
				redis.incr(dailyKey).then(() => redis.expire(dailyKey, DailyKeyLifetime))
			]);
			return total;
		} catch (error) {
			container.logger.error(`[Honeypot] Could not count the catch of the guild ${guildId} in Redis:`, error);
		}
	}

	const total = (localTotals.get(guildId) ?? 0) + 1;
	localTotals.set(guildId, total);
	localDays.set(`${guildId}:${day}`, (localDays.get(`${guildId}:${day}`) ?? 0) + 1);
	return total;
}

/**
 * Reads how many members the honeypot of a guild caught, see {@linkcode HoneypotStats}.
 */
export async function readHoneypotStats(guildId: Snowflake, now = new Date()): Promise<HoneypotStats> {
	const days = getRecentCatchDayKeys(now);
	const { redis } = container;
	if (redis?.status === 'ready') {
		try {
			const [total, counts] = await Promise.all([
				redis.hget(CatchesHash, guildId),
				redis.mget(...days.map((day) => `${CatchesHash}:${guildId}:${day}`))
			]);
			return { total: Number(total ?? 0), recent: counts.reduce((sum, count) => sum + Number(count ?? 0), 0) };
		} catch (error) {
			container.logger.error(`[Honeypot] Could not read the catches of the guild ${guildId} in Redis:`, error);
		}
	}

	return {
		total: localTotals.get(guildId) ?? 0,
		recent: days.reduce((sum, day) => sum + (localDays.get(`${guildId}:${day}`) ?? 0), 0)
	};
}
