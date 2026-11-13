import { claim, claimOnce, releaseClaim } from '#utils/claims';
import { container } from '@wolfstar/http-framework';

/** A Redis that only knows what a claim uses of it: `SET key value EX seconds NX`. */
function createRedis(status = 'ready') {
	const store = new Map<string, string>();
	return {
		store,
		status,
		set: vi.fn((key: string, value: string) => {
			if (store.has(key)) return Promise.resolve(null);
			store.set(key, value);
			return Promise.resolve('OK');
		}),
		del: vi.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
		// The release script: deletes the key only when it holds the token.
		eval: vi.fn((_script: string, _keys: number, key: string, token: string) =>
			Promise.resolve(store.get(key) === token && store.delete(key) ? 1 : 0)
		)
	};
}

describe('claims', () => {
	const original = container.redis;

	afterEach(() => {
		container.redis = original;
		vi.useRealTimers();
	});

	test('GIVEN something claimed twice THEN only the first one gets it, in Redis, for the time given', async () => {
		const redis = createRedis();
		container.redis = redis as never;

		expect(await claimOnce('alert:1', 60)).toBe(true);
		expect(await claimOnce('alert:1', 60)).toBe(false);
		expect(await claimOnce('alert:2', 60)).toBe(true);
		expect(redis.set).toHaveBeenCalledWith('wolfstar:claims:alert:1', expect.any(String), 'EX', 60, 'NX');
	});

	test('GIVEN no connection THEN the process keeps the claim, until it ends', async () => {
		vi.useFakeTimers();
		container.redis = createRedis('connecting') as never;

		expect(await claimOnce('local:1', 60)).toBe(true);
		expect(await claimOnce('local:1', 60)).toBe(false);

		vi.advanceTimersByTime(61_000);
		expect(await claimOnce('local:1', 60)).toBe(true);
	});

	test('GIVEN a connection that drops after a claim THEN the process still holds it', async () => {
		const redis = createRedis();
		container.redis = redis as never;

		expect(await claimOnce('drop:1', 60)).toBe(true);
		redis.status = 'reconnecting';
		expect(await claimOnce('drop:1', 60)).toBe(false);
	});

	test('GIVEN a connection that comes back after a claim THEN the process still holds it, whatever Redis has', async () => {
		const redis = createRedis('connecting');
		container.redis = redis as never;

		expect(await claimOnce('back:1', 60)).toBe(true);
		redis.status = 'ready';
		expect(await claimOnce('back:1', 60)).toBe(false);
		expect(redis.set).not.toHaveBeenCalled();
	});

	test('GIVEN a claim that is released THEN the next one gets it, in Redis and here', async () => {
		const redis = createRedis();
		container.redis = redis as never;

		const token = await claim('release:1', 60);
		expect(token).not.toBeNull();
		await releaseClaim('release:1', token!);
		expect(redis.store.has('wolfstar:claims:release:1')).toBe(false);
		expect(await claimOnce('release:1', 60)).toBe(true);
	});

	test('GIVEN a claim that ended and was claimed again WHEN the first one is released THEN the new claim stays', async () => {
		vi.useFakeTimers();
		const redis = createRedis();
		container.redis = redis as never;

		const first = await claim('slow:1', 60);
		// The claim ends, in Redis and here, and the next alert claims it:
		vi.advanceTimersByTime(61_000);
		redis.store.delete('wolfstar:claims:slow:1');
		const second = await claim('slow:1', 60);
		expect(second).not.toBeNull();

		await releaseClaim('slow:1', first!);

		expect(redis.store.get('wolfstar:claims:slow:1')).toBe(second);
		expect(await claimOnce('slow:1', 60)).toBe(false);
	});

	test('GIVEN a Redis that fails THEN the process keeps the claim, for the calls made at the same time too', async () => {
		const redis = createRedis();
		redis.set.mockRejectedValue(new Error('Connection is closed'));
		container.redis = redis as never;

		expect(await claimOnce('failing:1', 60)).toBe(true);
		expect(await claimOnce('failing:1', 60)).toBe(false);
		expect(await Promise.all([claimOnce('failing:2', 60), claimOnce('failing:2', 60)])).toEqual([true, false]);
	});
});
