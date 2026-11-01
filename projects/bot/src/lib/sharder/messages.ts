import { container } from '@wolfstar/http-framework';
import { bold, magenta } from 'colorette';

// This module is imported by the settings, which nearly everything imports: it must not import from `#lib`.

const header = bold(magenta('[SHARDER]'));

/**
 * The messages the shards send each other, by their `type`.
 */
export interface ShardMessages {
	/**
	 * The settings of a guild were written: by a shard, which the others drop their cached copy for, or by the dashboard,
	 * which the process that listens to the database tells every shard of, with the keys it changed. Only a write of the
	 * dashboard has `keys`.
	 */
	settingsUpdate: { guildId: string; keys?: readonly string[] };

	/**
	 * Every shard drops every cached copy of the settings and of what derives from them: the connection that hears the
	 * dashboard was down, and what it wrote meanwhile is not known.
	 */
	settingsInvalidateAll: Record<never, never>;
	/**
	 * The auto-moderation rules of a guild were changed by a shard, the others drop their cached copy.
	 */
	automodRulesUpdate: { guildId: string };

	/**
	 * The automatic deletions of a guild were changed by a shard, the others drop their cached copy.
	 */
	cleanupUpdate: { guildId: string };

	/**
	 * The predefined reasons of a guild were changed by a shard, the others drop their cached copy.
	 */
	moderationReasonsUpdate: { guildId: string };

	/**
	 * The thresholds of warnings of a guild were changed by a shard, the others drop their cached copy.
	 */
	warnThresholdsUpdate: { guildId: string };

	/**
	 * The role rules of a guild were changed by a shard, the others drop their cached copy.
	 */
	roleRulesUpdate: { guildId: string };

	/**
	 * The bot changed the settings or the rules of the join guard of a guild, the others drop their cached copy.
	 */
	joinGuardUpdate: { guildId: string };

	/**
	 * The website asked the join guard for something, which the shard manager hears and hands to the first shard.
	 */
	joinGuardRequest: { requestId: string };

	/**
	 * The dashboard asked for something to be done with the appeals, which goes the same way.
	 */
	appealRequest: { requestId: string };
}

export type ShardMessageType = keyof ShardMessages;
export type ShardMessage<Type extends ShardMessageType = ShardMessageType> = { [Key in Type]: { type: Key } & ShardMessages[Key] }[Type];

type ShardMessageHandler = (message: ShardMessage) => void;
const handlers = new Map<ShardMessageType, ShardMessageHandler[]>();

/**
 * Listens to a message of the other shards. Nothing is ever received when the bot runs in a single process.
 *
 * @param type - The type of the message.
 * @param handler - What to do with it.
 */
export function onShardMessage<Type extends ShardMessageType>(type: Type, handler: (message: ShardMessage<Type>) => void) {
	const list = handlers.get(type) ?? [];
	list.push(handler as ShardMessageHandler);
	handlers.set(type, list);
}

/**
 * Runs the handlers of a message received from another shard.
 *
 * @param message - The received message.
 */
export function dispatchShardMessage(message: ShardMessage) {
	for (const handler of handlers.get(message?.type) ?? []) handler(message);
}

/**
 * Sends a message to every other shard. Does nothing when the bot runs in a single process.
 *
 * @param message - The message to send.
 */
export function broadcastShardMessage(message: ShardMessage) {
	const shard = container.shard ?? null;
	if (shard === null) return;

	void shard.trySend(message, 'all').then((result) => result.inspectErr((error) => container.logger.error(`${header} ${error.message}`)));
}
