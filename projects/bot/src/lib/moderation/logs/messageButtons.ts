import type { Translator } from '#lib/structures/commands/utils';
import { messageLink } from '@discordjs/formatters';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import { ButtonStyle, ComponentType, type APIButtonComponent, type Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the `Get User ID` button, which is also the first part of its custom ID.
 */
export const LogUserHandlerName = 'logUser';

/**
 * Builds the custom ID of the `Get User ID` button of a log, `logUser.<userId>.id`.
 */
export function encodeLogUserId(userId: Snowflake) {
	return encodeCustomId(LogUserHandlerName, userId, 'id');
}

/**
 * Reads what {@linkcode encodeLogUserId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The user, `null` when the custom ID is not one of that button.
 */
export function decodeLogUserId(content: unknown): Snowflake | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null || decoded.action !== 'id' || !/^\d{17,20}$/.test(decoded.sessionId)) return null;
	return decoded.sessionId;
}

/**
 * Where a log of a message points to.
 */
export interface MessageLogTarget {
	/**
	 * Who sent the message.
	 */
	userId: Snowflake;
	guildId: Snowflake;
	channelId: Snowflake;
	messageId: Snowflake;
}

/**
 * The buttons under the log of a message: one that answers with the ID of who sent it, which is a long press away from
 * being copied (a mention cannot be copied as an ID on a phone), and one that jumps to the message.
 */
export function getMessageLogButtons(t: Translator, target: MessageLogTarget): APIButtonComponent[] {
	return [
		{
			type: ComponentType.Button,
			style: ButtonStyle.Secondary,
			custom_id: encodeLogUserId(target.userId),
			label: t('events/messages:logGetUserId')
		},
		{
			type: ComponentType.Button,
			style: ButtonStyle.Link,
			url: messageLink(target.channelId, target.messageId, target.guildId),
			label: t('events/messages:logJumpToMessage')
		}
	];
}
