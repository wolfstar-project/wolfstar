import { GuildCache } from '#utils/guildCache';

/** A read that stays pending until the test settles it, so an invalidation can land while it runs. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('GuildCache', () => {
	const guildId = '100000000000000000';

	test('GIVEN a read THEN the next one is served from the cache', async () => {
		const fetch = vi.fn(async () => ['rule']);
		const cache = new GuildCache(fetch);

		await cache.read(guildId);
		await cache.read(guildId);

		expect(fetch).toHaveBeenCalledOnce();
	});

	test('GIVEN a read that started before the guild was invalidated THEN what it read is not cached', async () => {
		const stale = deferred<string[]>();
		const fetch = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce([]);
		const cache = new GuildCache(fetch);

		const reading = cache.read(guildId);
		// The dashboard cleared the rules while the database was being asked:
		cache.forget(guildId);
		stale.resolve(['removed rule']);
		await reading;

		expect(await cache.read(guildId)).toStrictEqual([]);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test('GIVEN a read that started before every guild was invalidated THEN what it read is not cached', async () => {
		const stale = deferred<string[]>();
		const fetch = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce([]);
		const cache = new GuildCache(fetch);

		const reading = cache.read(guildId);
		// A reconnect of the listener: the notifications sent meanwhile are lost.
		cache.forgetAll();
		stale.resolve(['removed rule']);
		await reading;

		expect(await cache.read(guildId)).toStrictEqual([]);
	});

	test('GIVEN another guild is invalidated THEN a read of this one is still cached', async () => {
		const fetch = vi.fn(async () => ['rule']);
		const cache = new GuildCache(fetch);

		const reading = cache.read(guildId);
		cache.forget('200000000000000000');
		await reading;
		await cache.read(guildId);

		expect(fetch).toHaveBeenCalledOnce();
	});

	test('GIVEN a new read started before the old one settles THEN the old one neither fills nor drops it', async () => {
		const stale = deferred<string[]>();
		const fresh = deferred<string[]>();
		const fetch = vi.fn().mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
		const cache = new GuildCache(fetch);

		const old = cache.read(guildId);
		cache.forget(guildId);
		const replacement = cache.read(guildId);
		// A third reader shares the query that is running, not a query of its own:
		const shared = cache.read(guildId);

		stale.resolve(['removed rule']);
		await old;
		fresh.resolve([]);

		expect(await replacement).toStrictEqual([]);
		expect(await shared).toStrictEqual([]);
		expect(await cache.read(guildId)).toStrictEqual([]);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test('GIVEN a read that fails THEN the next one asks the database again', async () => {
		const fetch = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce(['rule']);
		const cache = new GuildCache(fetch);

		await expect(cache.read(guildId)).rejects.toThrow('connection lost');

		expect(await cache.read(guildId)).toStrictEqual(['rule']);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
