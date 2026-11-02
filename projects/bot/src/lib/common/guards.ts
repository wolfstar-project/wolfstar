import type { DMMessage, GuildMessage } from '#types';
import type { Message } from '@wolfstar/plugin-gateway';

/**
 * Checks whether or not a message was sent in a guild.
 * @param message The message to check.
 * @returns Whether the message was sent in a guild.
 */
export function isGuildMessage(message: Message): message is GuildMessage {
	return message.guildId !== null;
}

/**
 * Checks whether or not a message was sent in a DM channel.
 * @param message The message to check.
 * @returns Whether the message was sent in a DM channel.
 */
export function isPrivateMessage(message: Message): message is DMMessage {
	return message.guildId === null;
}

/**
 * Checks whether a message was sent by a webhook.
 *
 * @remarks
 *
 * The `webhookId` of a message of `@wolfstar/plugin-gateway` comes from `@discordjs/structures`, which leaves it
 * `undefined` when the message has no webhook, where discord.js gives `null`: a comparison with `null` takes every
 * message for the one of a webhook.
 *
 * @param message The message to check.
 * @returns Whether a webhook sent the message.
 */
export function isWebhookMessage(message: Message): boolean {
	return typeof message.webhookId === 'string';
}
