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
});
