import type { Message } from '@wolfstar/plugin-gateway';

/**
 * A gateway {@link Message} sent in a guild, by a member of it.
 */
export type GuildMessage = Message<true>;

/**
 * A gateway {@link Message} sent in a DM channel.
 */
export type DMMessage = Message<false>;

/**
 * A gateway {@link Message} that does not belong to a group DM channel.
 */
export type NonGroupMessage = Message;
