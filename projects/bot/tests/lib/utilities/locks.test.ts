import { acquireSharedLock, withSharedLock } from '#utils/locks';
import { container } from '@wolfstar/http-framework';

/** A Redis that only knows what the locks use of it: `SET key value PX ms NX` and the script that releases. */
function createRedis() {
	const store = new Map<string, string>();
	return {
		store,
		status: 'ready',
		set: (key: string, value: string) => {
			if (store.has(key)) return Promise.resolve(null);
			store.set(key, value);
			return Promise.resolve('OK');
		},
		eval: (_script: string, _keys: number, key: string, token: string) => {
			if (store.get(key) !== token) return Promise.resolve(0);
			store.delete(key);
			return Promise.resolve(1);
		}
	};
}

describe('shared locks', () => {
	const original = container.redis;
	let redis: ReturnType<typeof createRedis>;

	beforeEach(() => {
		redis = createRedis();
		container.redis = redis as never;
	});

	afterAll(() => {
		container.redis = original;
	});

	test('GIVEN a lock THEN it is held until it is released, once', async () => {
		const release = await acquireSharedLock('test');
		expect(redis.store.size).toBe(1);

		await release();
		await release();
		expect(redis.store.size).toBe(0);
	});

	test('GIVEN a lock that is held THEN the next one waits for it', async () => {
		const order: string[] = [];
		const first = withSharedLock('test', async () => {
			await new Promise((resolve) => setTimeout(resolve, 120));
			order.push('first');
		});
		const second = withSharedLock('test', async () => {
			order.push('second');
		});

		await Promise.all([first, second]);
		expect(order).toEqual(['first', 'second']);
	});

	test('GIVEN a function that throws THEN the lock is released', async () => {
		await expect(withSharedLock('test', () => Promise.reject(new Error('failed')))).rejects.toThrow('failed');
		expect(redis.store.size).toBe(0);
	});

	test('GIVEN no connection to Redis THEN nothing is locked', async () => {
		container.redis = { ...redis, status: 'wait' } as never;

		await expect(withSharedLock('test', () => Promise.resolve('done'))).resolves.toBe('done');
		expect(redis.store.size).toBe(0);
	});
});
