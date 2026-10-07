import { container } from '@wolfstar/http-framework';
import { bold, magenta } from 'colorette';

// This module is imported by the settings, which nearly everything imports: it must not import from `#lib`.

const header = bold(magenta('[SHARDER]'));

/**
 * The messages the shards send each other, by their `type`.
 */
export interface ShardMessages {
	/**
	 * The settings of a guild were written by a shard, the others drop their cached copy.
	 */
	settingsUpdate: { guildId: string };
	/**
	 * The auto-moderation rules of a guild were changed by a shard, the others drop their cached copy.
	 */
	automodRulesUpdate: { guildId: string };
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
