import { retryWithDelays } from '#common';

describe('promises', () => {
	describe('retryWithDelays', () => {
		test('GIVEN a function that works THEN it is run once', async () => {
			const run = vi.fn(async () => 'done');

			await expect(retryWithDelays(run, [0, 0])).resolves.toBe('done');
			expect(run).toHaveBeenCalledTimes(1);
		});

		test('GIVEN a function that fails twice THEN the third attempt answers', async () => {
			const run = vi.fn(async (attempt: number) => {
				if (attempt < 3) throw new Error(`attempt ${attempt}`);
				return attempt;
			});

			await expect(retryWithDelays(run, [0, 0])).resolves.toBe(3);
			expect(run).toHaveBeenCalledTimes(3);
		});

		test('GIVEN a function that always fails THEN it is tried once more than there are delays, and the last error is thrown', async () => {
			const run = vi.fn(async (attempt: number) => {
				throw new Error(`attempt ${attempt}`);
			});

			await expect(retryWithDelays(run, [0, 0])).rejects.toThrow('attempt 3');
			expect(run).toHaveBeenCalledTimes(3);
		});

		test('GIVEN delays THEN each failure waits for its own', async () => {
			const times: number[] = [];
			const run = vi.fn(async (attempt: number) => {
				times.push(performance.now());
				if (attempt < 3) throw new Error('not yet');
				return attempt;
			});

			await expect(retryWithDelays(run, [30, 60])).resolves.toBe(3);
			// The timers of Node may fire a millisecond early:
			expect(times[1] - times[0]).toBeGreaterThanOrEqual(28);
			expect(times[2] - times[1]).toBeGreaterThanOrEqual(58);
		});
	});
});
