import { countHoneypotCatch, getCatchDayKey, getRecentCatchDayKeys, readHoneypotStats, RecentCatchesDays } from '#lib/moderation/honeypot/stats';
import { container } from '@wolfstar/http-framework';

const guildId = '254360814063058944';

/** A Redis that only knows what the stats use of it. */
function createRedis() {
	const hash = new Map<string, number>();
	const keys = new Map<string, number>();
	return {
		status: 'ready',
		hash,
		keys,
		hincrby: vi.fn(async (_hash: string, field: string, amount: number) => {
			const value = (hash.get(field) ?? 0) + amount;
			hash.set(field, value);
			return value;
		}),
		hget: vi.fn(async (_hash: string, field: string) => (hash.has(field) ? String(hash.get(field)) : null)),
		incr: vi.fn(async (key: string) => {
			const value = (keys.get(key) ?? 0) + 1;
			keys.set(key, value);
			return value;
		}),
		expire: vi.fn(async () => 1),
		mget: vi.fn(async (...names: string[]) => names.map((name) => (keys.has(name) ? String(keys.get(name)) : null)))
	};
}

describe('the catches of a honeypot', () => {
	const original = container.redis;
	const now = new Date(Date.UTC(2026, 10, 3, 12));

	afterEach(() => {
		container.redis = original;
	});

	test('GIVEN a day THEN its key is the date in UTC, and the recent days are the last seven', () => {
		expect(getCatchDayKey(now)).toBe('2026-11-03');
		expect(getRecentCatchDayKeys(now)).toHaveLength(RecentCatchesDays);
		expect(getRecentCatchDayKeys(now)[0]).toBe('2026-11-03');
		expect(getRecentCatchDayKeys(now).at(-1)).toBe('2026-10-28');
	});

	test('GIVEN catches THEN they are counted in Redis, in all and by day, and read back', async () => {
		const redis = createRedis();
		container.redis = redis as never;

		expect(await countHoneypotCatch(guildId, now)).toBe(1);
		expect(await countHoneypotCatch(guildId, now)).toBe(2);
		expect(await countHoneypotCatch(guildId, new Date(now.getTime() - 10 * 86_400_000))).toBe(3);
		expect(redis.expire).toHaveBeenCalledWith('wolfstar:honeypot:catches:254360814063058944:2026-11-03', 8 * 86_400);

		expect(await readHoneypotStats(guildId, now)).toEqual({ total: 3, recent: 2 });
	});

	test('GIVEN no connection THEN the process counts for itself', async () => {
		container.redis = { status: 'connecting' } as never;

		await countHoneypotCatch('254360814063058945', now);
		await countHoneypotCatch('254360814063058945', now);

		expect(await readHoneypotStats('254360814063058945', now)).toEqual({ total: 2, recent: 2 });
		expect(await readHoneypotStats('254360814063058946', now)).toEqual({ total: 0, recent: 0 });
	});
});
