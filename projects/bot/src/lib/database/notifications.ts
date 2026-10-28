/**
 * The channels the website notifies, in the transaction of the write they tell about:
 *
 * - `guild_settings_update`, with `{ "guildId": "…", "keys": ["…"] }`, the flat `GuildData` keys a write of the
 *   dashboard changed (`pg_notify('guild_settings_update', $1)`);
 * - `join_guard_request`, with the ID of a `JoinGuardRequest` it inserted (`NOTIFY join_guard_request, '<id>'`).
 */
export const DatabaseNotificationChannels = {
	GuildSettingsUpdate: 'guild_settings_update',
	JoinGuardRequest: 'join_guard_request'
} as const;

export type DatabaseNotificationChannel = (typeof DatabaseNotificationChannels)[keyof typeof DatabaseNotificationChannels];

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

export interface DatabaseNotificationListenerOptions {
	/** Makes a new connection, for each attempt. */
	createClient(): NotificationClient;
	/** What to do with the payload of each channel to listen to. */
	channels: Partial<Record<DatabaseNotificationChannel, (payload: string) => void>>;
	/**
	 * Runs every time the connection listens again, the first time included: what was notified while it did not is lost,
	 * so whatever depends on the notifications catches up here.
	 */
	onListen?(): void;
	logger: Logger;
	/** How long the first attempt to connect again waits, doubled after each that fails, up to `maximumBackoff`. */
	initialBackoff?: number;
	maximumBackoff?: number;
}

const Header = '[Database]';

/**
 * Keeps one connection to PostgreSQL that listens to the channels the website notifies, and connects again with a
 * growing delay when it is lost. It is the only one of the bot: a connection of the pool of Prisma is lent to one query
 * at a time, and a `LISTEN` lasts.
 */
export class DatabaseNotificationListener {
	readonly #options: Required<Omit<DatabaseNotificationListenerOptions, 'onListen'>> & Pick<DatabaseNotificationListenerOptions, 'onListen'>;
	#client: NotificationClient | null = null;
	#stopped = true;
	#attempts = 0;
	#reconnectTimer: NodeJS.Timeout | null = null;

	public constructor(options: DatabaseNotificationListenerOptions) {
		this.#options = { initialBackoff: 1000, maximumBackoff: 60_000, ...options };
	}

	public start() {
		if (!this.#stopped) return;

		this.#stopped = false;
		void this.#connect();
	}

	public async stop() {
		this.#stopped = true;
		if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = null;

		const client = this.#client;
		this.#client = null;
		await client?.end();
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

			this.#options.logger.warn(`${Header} The connection that hears the website was lost, connecting again.`, error ?? '');
			// The connection already failed, so what ending it throws is of no use:
			client.end().catch(() => undefined);
			this.#scheduleReconnect();
		};

		client.on('error', (error) => lose(error));
		client.on('end', () => lose());
		client.on('notification', (message) => this.#dispatch(message.channel, message.payload));

		const channels = Object.keys(this.#options.channels);
		try {
			await client.connect();
			for (const channel of channels) await client.query(`LISTEN ${channel}`);
		} catch (error) {
			lose(error as Error);
			return;
		}

		if (this.#client !== client) return;
		this.#attempts = 0;
		this.#options.logger.info(`${Header} Listening to ${channels.join(', ')}.`);
		this.#options.onListen?.();
	}

	#dispatch(channel: string, payload: string | undefined) {
		const handler = this.#options.channels[channel as DatabaseNotificationChannel];
		if (handler === undefined || payload === undefined) return;

		try {
			handler(payload);
		} catch (error) {
			this.#options.logger.error(`${Header} Could not handle a notification of ${channel}:`, error);
		}
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
