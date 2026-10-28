interface Logger {
	error(...values: readonly unknown[]): void;
}

export interface JoinGuardRequestQueueOptions {
	/** Handles a request by its ID, see `handleJoinGuardRequest`. */
	handle(requestId: string): Promise<unknown>;
	/** Reads the IDs of the requests nobody claimed, see `fetchJoinGuardRequestsToSweep`. */
	sweep(): Promise<readonly string[]>;
	logger: Logger;
	/** How often the requests are swept, in milliseconds. */
	sweepInterval?: number;
}

const Header = '[JoinGuard]';

/**
 * Handles the requests of the website to the join guard one after the other: the ones a notification brings, and the
 * ones a sweep finds, at the start and every `sweepInterval`, so a notification that was lost, or sent while the
 * connection was down, delays its request by that interval at most.
 *
 * @remarks A request that is already queued is not queued again. Each is claimed in the database before it is done,
 * so a notification and a sweep, or two processes, never do it twice.
 */
export class JoinGuardRequestQueue {
	readonly #options: Required<JoinGuardRequestQueueOptions>;
	#sweepTimer: NodeJS.Timeout | null = null;
	#queue: Promise<void> = Promise.resolve();
	readonly #queued = new Set<string>();

	public constructor(options: JoinGuardRequestQueueOptions) {
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
				this.#options.logger.error(`${Header} Could not handle the request ${id}:`, error);
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
			this.#options.logger.error(`${Header} Could not read the requests of the website:`, error);
			return;
		}

		await Promise.all(ids.map((id) => this.enqueue(id)));
	}
}
