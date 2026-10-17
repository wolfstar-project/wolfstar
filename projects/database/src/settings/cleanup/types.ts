import type { Snowflake } from 'discord-api-types/v10';

/**
 * What an automatic purge looks for in the messages it deletes:
 *
 * - `any`: every message.
 * - `user`: the messages of a user, whose ID is the value.
 * - `contains`, `notContains`, `startsWith`, `endsWith`: the messages whose text does, or does not, have the value.
 * - `links`, `invites`, `images`, `mentions`, `embeds`: the messages that have one.
 * - `bots`, `humans`: the messages of bots, or of everybody else.
 * - `text`: the messages that are only text, without attachments.
 */
export const CleanupFilterKinds = [
	'any',
	'user',
	'contains',
	'notContains',
	'startsWith',
	'endsWith',
	'links',
	'invites',
	'images',
	'mentions',
	'embeds',
	'bots',
	'humans',
	'text'
] as const;
export type CleanupFilterKind = (typeof CleanupFilterKinds)[number];

/**
 * The filters that need a value: a user ID for `user`, a text for the others.
 */
export const CleanupFilterKindsWithValue = [
	'user',
	'contains',
	'notContains',
	'startsWith',
	'endsWith'
] as const satisfies readonly CleanupFilterKind[];

/**
 * What an automatic deletion can leave in a channel, the messages that match one of them are kept.
 */
export const AutoDeleteAllowKinds = ['links', 'invites', 'images', 'mentions', 'embeds', 'text'] as const satisfies readonly CleanupFilterKind[];
export type AutoDeleteAllowKind = (typeof AutoDeleteAllowKinds)[number];

/**
 * A channel that is purged of the messages that match a filter, every interval. Snowflakes are strings, as in
 * `GuildData`, and the times are in milliseconds.
 */
export interface AutoPurge {
	id: string;
	guildId: Snowflake;
	channelId: Snowflake;
	interval: number;
	filter: CleanupFilterKind;
	value: string | null;
	nextRunAt: number;
}

/**
 * A channel whose messages are deleted a delay after they are sent, but the ones that match what it allows.
 */
export interface AutoDelete {
	id: string;
	guildId: Snowflake;
	channelId: Snowflake;
	delay: number;
	allow: AutoDeleteAllowKind[];

	/**
	 * Whether the messages of bots and webhooks are deleted too.
	 */
	bots: boolean;
}

export type AutoPurgeData = Pick<AutoPurge, 'channelId' | 'interval' | 'filter' | 'value'>;
export type AutoDeleteData = Pick<AutoDelete, 'channelId' | 'delay' | 'allow' | 'bots'>;

/** The most channels of a guild that are purged, and that have their messages deleted. */
export const MaximumAutoPurgeChannels = 10;
export const MaximumAutoDeleteChannels = 25;

/** The longest text a filter looks for. */
export const MaximumCleanupValueLength = 100;

/**
 * The limits of the interval of a purge and of the delay of a deletion, in milliseconds. Discord only deletes in bulk
 * the messages of the last 14 days, so a longer interval would leave messages a purge can no longer delete.
 */
export const AutoPurgeIntervalLimits = { minimum: 5 * 60_000, maximum: 14 * 24 * 60 * 60_000 } as const;
export const AutoDeleteDelayLimits = { minimum: 0, maximum: 24 * 60 * 60_000 } as const;

export function isCleanupFilterKind(value: unknown): value is CleanupFilterKind {
	return CleanupFilterKinds.includes(value as CleanupFilterKind);
}

export function isAutoDeleteAllowKind(value: unknown): value is AutoDeleteAllowKind {
	return AutoDeleteAllowKinds.includes(value as AutoDeleteAllowKind);
}
