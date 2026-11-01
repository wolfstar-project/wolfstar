import { SharedLockReleaseScript } from '#utils/locks';
import { container } from '@wolfstar/http-framework';
import { randomUUID } from 'node:crypto';

interface Logger {
	error(...values: readonly unknown[]): void;
}

/**
 * How long a process holds a request of the website before another one may take it, in milliseconds.
 */
const RequestLeaseDuration = 120_000;

/**
 * The requests this process holds while Redis cannot be asked, see {@linkcode leaseRequest}.
 */
const localLeases = new Set<string>();

/**
 * Takes a request of the website for this process, so its notification, a sweep and another process do not handle it at
 * once.
 *
 * @remarks The lease is in Redis and runs out on its own, so a process that stops while it holds one does not keep the
 * request from being done: its `processed_at` is still not set. Without a connection, or when Redis fails, the process
 * keeps the lease itself, which is all a single process needs.
 *
 * @param key - The key of the lease.
 * @param header - What the logs start with.
 * @returns What gives the request back, `null` when another handler holds it.
 */
export async function leaseRequest(key: string, header: string): Promise<(() => Promise<void>) | null> {
	const { redis } = container;
	if (redis?.status === 'ready') {
		const token = randomUUID();
		try {
			if ((await redis.set(key, token, 'PX', RequestLeaseDuration, 'NX')) === null) return null;
			return async () => {
				await redis
					.eval(SharedLockReleaseScript, 1, key, token)
					.catch((error: unknown) => container.logger.error(`${header} Could not give back the lease ${key}:`, error));
			};
		} catch (error) {
			container.logger.error(`${header} Could not take the lease ${key} in Redis:`, error);
		}
	}

	if (localLeases.has(key)) return null;
	localLeases.add(key);
	return async () => {
		localLeases.delete(key);
	};
}

export interface RequestQueueOptions {
	/** What the logs start with. */
	header: string;
	/** Handles a request by its ID. */
	handle(requestId: string): Promise<unknown>;
	/** Reads the IDs of the requests nobody claimed. */
	sweep(): Promise<readonly string[]>;
	logger: Logger;
	/** How often the requests are swept, in milliseconds. */
	sweepInterval?: number;
}

/**
 * Handles the requests of the website one after the other: the ones a notification brings, and the
 * ones a sweep finds, at the start and every `sweepInterval`, so a notification that was lost, or sent while the
 * connection was down, delays its request by that interval at most.
 *
 * @remarks A request that is already queued is not queued again. Each is claimed in the database before it is done,
 * so a notification and a sweep, or two processes, never do it twice.
 */
export class RequestQueue {
	readonly #options: Required<RequestQueueOptions>;
	#sweepTimer: NodeJS.Timeout | null = null;
	#queue: Promise<void> = Promise.resolve();
	readonly #queued = new Set<string>();

	public constructor(options: RequestQueueOptions) {
		this.#options = { sweepInterval: 30_000, ...options };
	}

	public start() {
		if (this.#sweepTimer !== null) return;

		void this.sweep();
		this.#sweepTimer = setInterval(() => void this.sweep(), this.#options.sweepInterval);
		this.#sweepTimer.unref();
	}

	public async stop() {
		if (this.#sweepTimer !== null) clearInterval(this.#sweepTimer);
		this.#sweepTimer = null;
		await this.#queue;
	}

	/**
	 * Queues a request, unless it is queued already.
	 *
	 * @returns When the request was handled.
	 */
	public enqueue(requestId: string): Promise<void> {
		const id = requestId.trim();
		if (id.length === 0 || this.#queued.has(id)) return this.#queue;

		this.#queued.add(id);
		this.#queue = this.#queue.then(async () => {
			try {
				await this.#options.handle(id);
			} catch (error) {
				this.#options.logger.error(`${this.#options.header} Could not handle the request ${id}:`, error);
			} finally {
				this.#queued.delete(id);
			}
		});
		return this.#queue;
	}

	/**
	 * Queues the requests nobody claimed.
	 */
	public async sweep(): Promise<void> {
		let ids: readonly string[];
		try {
			ids = await this.#options.sweep();
		} catch (error) {
			this.#options.logger.error(`${this.#options.header} Could not read the requests of the website:`, error);
			return;
		}

		await Promise.all(ids.map((id) => this.enqueue(id)));
	}
}
