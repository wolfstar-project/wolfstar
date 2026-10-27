import { JoinGuardRequestQueue } from '#lib/moderation/joinguard/queue';

describe('JoinGuardRequestQueue', () => {
	const logger = { error: vi.fn() };

	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test('GIVEN a request notified and swept at once THEN it is handled once', async () => {
		const handle = vi.fn(async () => undefined);
		const queue = new JoinGuardRequestQueue({ handle, sweep: async () => [], logger });

		await Promise.all([queue.enqueue('7'), queue.enqueue('7'), queue.enqueue(' ')]);

		expect(handle).toHaveBeenCalledTimes(1);
		expect(handle).toHaveBeenCalledWith('7');
	});

	test('GIVEN the start and the interval THEN the requests nobody claimed are swept', async () => {
		const handle = vi.fn(async () => undefined);
		const sweep = vi.fn(async () => ['1', '2']);
		const queue = new JoinGuardRequestQueue({ handle, sweep, logger, sweepInterval: 30_000 });
		queue.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(sweep).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(30_000);

		expect(sweep).toHaveBeenCalledTimes(2);
		expect(handle).toHaveBeenCalledWith('1');
		expect(handle).toHaveBeenCalledWith('2');
		await queue.stop();
	});

	test('GIVEN a request that throws THEN the next ones are still handled', async () => {
		const handle = vi.fn(async (id: string) => {
			if (id === '1') throw new Error('boom');
		});
		const queue = new JoinGuardRequestQueue({ handle, sweep: async () => [], logger });

		await Promise.all([queue.enqueue('1'), queue.enqueue('2')]);

		expect(handle).toHaveBeenCalledWith('2');
		expect(logger.error).toHaveBeenCalledTimes(1);
	});
});
