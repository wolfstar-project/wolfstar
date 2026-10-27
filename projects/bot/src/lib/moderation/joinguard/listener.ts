/**
 * The channel the website notifies, with the ID of the request as the payload, in the transaction that inserts it:
 * `NOTIFY join_guard_request, '<id>'`.
 */
export const JoinGuardRequestChannel = 'join_guard_request';

/**
 * What the listener needs of a connection to PostgreSQL, which a `Client` of `pg` is.
 */
export interface NotificationClient {
	connect(): Promise<unknown>;
	query(text: string): Promise<unknown>;
	end(): Promise<unknown>;
	on(event: 'notification', listener: (message: { channel: string; payload?: string }) => void): unknown;
	on(event: 'error', listener: (error: Error) => void): unknown;
	on(event: 'end', listener: () => void): unknown;
}

interface Logger {
	info(...values: readonly unknown[]): void;
	warn(...values: readonly unknown[]): void;
	error(...values: readonly unknown[]): void;
}

export interface JoinGuardRequestListenerOptions {
	/** Makes a new connection, for each attempt. */
	createClient(): NotificationClient;
	/** Handles a request by its ID, see `handleJoinGuardRequest`. */
	handle(requestId: string): Promise<unknown>;
	/** Reads the IDs of the requests nobody claimed, see `fetchJoinGuardRequestsToSweep`. */
	sweep(): Promise<readonly string[]>;
	logger: Logger;
	/** How often the requests are swept, in milliseconds. */
	sweepInterval?: number;
	/** How long the first attempt to connect again waits, doubled after each that fails, up to `maximumBackoff`. */
	initialBackoff?: number;
	maximumBackoff?: number;
}

const Header = '[JoinGuard]';

/**
 * Hears the requests of the website: it keeps one connection that listens to {@linkcode JoinGuardRequestChannel}, and
 * connects again with a growing delay when it is lost. It also sweeps the requests nobody claimed, at the start, after
 * each connection and every `sweepInterval`, so a notification that was lost only delays its request.
 *
 * @remarks The requests are handled one after the other, and one that is already queued is not queued again. Each is
 * claimed in the database before it is done, so a notification and a sweep, or two processes, never do it twice.
 */
export class JoinGuardRequestListener {
	readonly #options: Required<JoinGuardRequestListenerOptions>;
	#client: NotificationClient | null = null;
	#stopped = true;
	#attempts = 0;
	#reconnectTimer: NodeJS.Timeout | null = null;
	#sweepTimer: NodeJS.Timeout | null = null;
	#queue: Promise<void> = Promise.resolve();
	readonly #queued = new Set<string>();

	public constructor(options: JoinGuardRequestListenerOptions) {
		this.#options = { sweepInterval: 30_000, initialBackoff: 1000, maximumBackoff: 60_000, ...options };
	}

	public start() {
		if (!this.#stopped) return;

		this.#stopped = false;
		void this.#connect();
		void this.sweep();
		this.#sweepTimer = setInterval(() => void this.sweep(), this.#options.sweepInterval);
		this.#sweepTimer.unref();
	}

	public async stop() {
		this.#stopped = true;
		if (this.#sweepTimer !== null) clearInterval(this.#sweepTimer);
		if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
		this.#sweepTimer = null;
		this.#reconnectTimer = null;

		const client = this.#client;
		this.#client = null;
		await client?.end();
		await this.#queue;
	}

	/**
	 * Queues a request, unless it is queued already.
	 *
	 * @returns When the request was handled.
	 */
	public enqueue(requestId: string): Promise<void> {
		if (this.#queued.has(requestId)) return this.#queue;

		this.#queued.add(requestId);
		this.#queue = this.#queue.then(async () => {
			try {
				await this.#options.handle(requestId);
			} catch (error) {
				this.#options.logger.error(`${Header} Could not handle the request ${requestId}:`, error);
			} finally {
				this.#queued.delete(requestId);
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

	async #connect() {
		if (this.#stopped) return;

		const client = this.#options.createClient();
		this.#client = client;

		let lost = false;
		const lose = (error?: Error) => {
			if (lost || this.#client !== client) return;
			lost = true;
			this.#client = null;
			if (this.#stopped) return;

			this.#options.logger.warn(`${Header} The connection that hears the requests of the website was lost, connecting again.`, error ?? '');
			// The connection already failed, so what ending it throws is of no use:
			client.end().catch(() => undefined);
			this.#scheduleReconnect();
		};

		client.on('error', (error) => lose(error));
		client.on('end', () => lose());
		client.on('notification', (message) => {
			if (message.channel !== JoinGuardRequestChannel || !message.payload) return;
			void this.enqueue(message.payload.trim());
		});

		try {
			await client.connect();
			await client.query(`LISTEN ${JoinGuardRequestChannel}`);
		} catch (error) {
			lose(error as Error);
			return;
		}

		if (this.#client !== client) return;
		this.#attempts = 0;
		this.#options.logger.info(`${Header} Listening to the requests of the website.`);
		// What was notified while the connection was down is only found by a sweep:
		void this.sweep();
	}

	#scheduleReconnect() {
		const delay = Math.min(this.#options.maximumBackoff, this.#options.initialBackoff * 2 ** this.#attempts);
		this.#attempts++;
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			void this.#connect();
		}, delay);
		this.#reconnectTimer.unref();
	}
}
