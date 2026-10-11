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

/**
 * The emoji of a reaction added through the gateway, with who added it.
 */
export interface ReactionAddEmoji {
	animated: boolean;
	id: string | null;
	managed: boolean | null;
	name: string | null;
	requireColons: boolean | null;
	roles: string[] | null;
	user: { id: string };
}

/**
 * The data of a reaction added through the gateway. The channel and the guild are referenced by their ids, as the
 * gateway structures are resolved asynchronously from the cache.
 */
export interface ReactionAddData {
	channelId: string;
	emoji: ReactionAddEmoji;
	guildId: string;
	messageId: string;
	userId: string;
}
