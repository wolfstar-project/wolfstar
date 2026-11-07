import type { Snowflake } from 'discord-api-types/v10';

/**
 * A message that is sent in a channel again every interval. Snowflakes are strings, as in `GuildData`, and the times
 * are in milliseconds.
 */
export interface AutoMessage {
	id: string;
	guildId: Snowflake;
	channelId: Snowflake;
	content: string;
	interval: number;

	/**
	 * Whether the mentions of the message ping who they mention. They do not unless the administrator asks for it.
	 */
	mentions: boolean;

	/**
	 * The ID of the message the bot sent last, `null` before the first one.
	 */
	lastMessageId: Snowflake | null;
	nextRunAt: number;
}

export type AutoMessageData = Pick<AutoMessage, 'channelId' | 'content' | 'interval' | 'mentions'>;

/** The most automatic messages a guild has, one per channel. */
export const MaximumAutoMessages = 10;

/** The longest message Discord sends. */
export const MaximumAutoMessageLength = 2000;

/**
 * The limits of the interval of an automatic message, in milliseconds: the shortest keeps a channel from being filled
 * with it, the longest is the one of the automatic purges.
 */
export const AutoMessageIntervalLimits = { minimum: 10 * 60_000, maximum: 14 * 24 * 60 * 60_000 } as const;
