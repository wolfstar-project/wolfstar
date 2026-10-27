import { DatabaseNotificationChannels, DatabaseNotificationListener, type NotificationClient } from '#lib/database/notifications';
import { parseDashboardSettingsUpdate, type DashboardSettingsUpdate } from '#lib/database/settings/dashboard';
import { dispatchShardMessage, type ShardMessage } from '#lib/sharder/messages';

/**
 * Where what the website notifies goes: to the shards of the bot, or to this process when it is the only one.
 */
export interface WebsiteNotificationTarget {
	/** The dashboard wrote the settings of a guild. */
	settingsUpdate(update: DashboardSettingsUpdate): void;
	/** What the dashboard wrote while nobody listened is not known: every cached copy goes. */
	invalidateAllSettings(): void;
	/** The website asked the join guard for something. */
	joinGuardRequest(requestId: string): void;
}

interface Logger {
	info(...values: readonly unknown[]): void;
	warn(...values: readonly unknown[]): void;
	error(...values: readonly unknown[]): void;
}

/**
 * Creates the one connection of the bot that hears the website, see {@linkcode DatabaseNotificationListener}: the
 * writes of the dashboard to the settings, and the requests to the join guard. Every time it listens, the first time
 * included, every cached copy of the settings is dropped, since a write made while it did not is lost.
 *
 * @param target - Where what it hears goes.
 * @param options - How it connects, and where it logs.
 */
export function createWebsiteListener(
	target: WebsiteNotificationTarget,
	options: { createClient(): NotificationClient; logger: Logger }
): DatabaseNotificationListener {
	return new DatabaseNotificationListener({
		createClient: options.createClient,
		logger: options.logger,
		channels: {
			[DatabaseNotificationChannels.GuildSettingsUpdate]: (payload) => {
				const update = parseDashboardSettingsUpdate(payload);
				if (update === null) {
					options.logger.warn(`[Database] Ignored a notification of guild_settings_update that is not a write: ${payload.slice(0, 200)}`);
					return;
				}
				target.settingsUpdate(update);
			},
			[DatabaseNotificationChannels.JoinGuardRequest]: (payload) => target.joinGuardRequest(payload.trim())
		},
		onListen: () => target.invalidateAllSettings()
	});
}

/**
 * The target of a bot that runs in one process: the messages the shards would get are dispatched here, and the
 * requests of the join guard are queued here.
 *
 * @param enqueue - Queues a request of the join guard, see `JoinGuardRequestQueue`.
 */
export function createLocalWebsiteTarget(enqueue: (requestId: string) => unknown): WebsiteNotificationTarget {
	return {
		settingsUpdate: ({ guildId, keys }) => dispatchShardMessage({ type: 'settingsUpdate', guildId, keys }),
		invalidateAllSettings: () => dispatchShardMessage({ type: 'settingsInvalidateAll' }),
		joinGuardRequest: (requestId) => void enqueue(requestId)
	};
}

/**
 * What the target of the shard manager needs of it.
 */
export interface ShardMessenger {
	broadcast(body: unknown): Promise<void>;
	send(channelId: number, body: unknown): Promise<void>;
}

/**
 * The target of the shard manager: every shard gets the writes of the dashboard, and the first one, where the join
 * guard handles its requests, gets them.
 *
 * @param manager - The shard manager.
 * @param logger - Where a message that could not be sent is logged.
 */
export function createShardManagerWebsiteTarget(manager: ShardMessenger, logger: Logger): WebsiteNotificationTarget {
	const send = (message: ShardMessage, channelId: number | null) =>
		void (channelId === null ? manager.broadcast(message) : manager.send(channelId, message)).catch((error: unknown) =>
			logger.error(`[Database] Could not tell the shards of ${message.type}:`, error)
		);

	return {
		settingsUpdate: ({ guildId, keys }) => send({ type: 'settingsUpdate', guildId, keys }, null),
		invalidateAllSettings: () => send({ type: 'settingsInvalidateAll' }, null),
		joinGuardRequest: (requestId) => send({ type: 'joinGuardRequest', requestId }, 0)
	};
}
