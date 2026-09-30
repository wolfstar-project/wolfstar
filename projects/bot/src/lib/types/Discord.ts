import type { GuildMember, Message } from '@wolfstar/plugin-gateway';

/**
 * A gateway {@link Message} sent in a guild, by a member of it.
 */
export type GuildMessage = Message & { guildId: string; member: GuildMember };

/**
 * A gateway {@link Message} sent in a DM channel.
 */
export type DMMessage = Message & { guildId: null };

/**
 * A gateway {@link Message} that does not belong to a group DM channel.
 */
export type NonGroupMessage = Message;
