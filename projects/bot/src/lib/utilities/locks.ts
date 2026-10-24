import { container } from '@wolfstar/http-framework';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * How long a lock is held at most, should the process that took it die before releasing it, how long another process
 * waits for it, and how often it looks.
 */
const LockDuration = 15_000;
const LockWait = 10_000;
const LockInterval = 50;

/**
 * Deletes a lock only when it still holds the token of who releases it: a lock that expired and was taken by another
 * process is theirs.
 */
const ReleaseScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * Takes a lock every process of the bot respects (the shards, the workers, the API), so what reads a row and writes it
 * back is not undone by another process doing the same.
 *
 * @remarks
 *
 * The lock lives in Redis. Without a connection (the tests, a bot that is starting) nothing is locked and the queues of
 * the process are all there is, and a lock that cannot be taken in time is not waited for forever: the write goes on,
 * as it did before, and the failure is logged.
 *
 * @param key - What is locked, e.g. `settings:<guildId>`.
 * @returns The function that releases the lock, which is safe to call more than once.
 */
export async function acquireSharedLock(key: string): Promise<() => Promise<void>> {
	const { redis } = container;
	if (redis?.status !== 'ready') return async () => {};

	const name = `wolfstar:locks:${key}`;
	const token = randomUUID();
	const deadline = Date.now() + LockWait;
	try {
		while ((await redis.set(name, token, 'PX', LockDuration, 'NX')) === null) {
			if (Date.now() >= deadline) {
				container.logger.warn(`[LOCKS] Could not take the lock ${key} in time, going on without it.`);
				return async () => {};
			}

			await sleep(LockInterval);
		}
	} catch (error) {
		container.logger.error(`[LOCKS] Could not take the lock ${key}:`, error);
		return async () => {};
	}

	let released = false;
	return async () => {
		if (released) return;
		released = true;
		await redis.eval(ReleaseScript, 1, name, token).catch((error: unknown) => container.logger.error(`[LOCKS] Could not release ${key}:`, error));
	};
}

/**
 * Runs a function while holding a lock, see {@linkcode acquireSharedLock}.
 */
export async function withSharedLock<T>(key: string, callback: () => Promise<T>): Promise<T> {
	const release = await acquireSharedLock(key);
	try {
		return await callback();
	} finally {
		await release();
	}
}
