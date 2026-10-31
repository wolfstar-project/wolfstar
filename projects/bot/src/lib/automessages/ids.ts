import { seconds } from 'wolfstar-shared';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler that reads the modal of `/automessage enable`, which is also the first part of
 * its custom ID.
 */
export const AutoMessageHandlerName = 'automessage';

/**
 * What `/automessage enable` was given, which waits in the custom ID of its modal until the text is written:
 * `automessage.<ownerId>.enable:<channelId>:<interval>:<mentions>`, the interval in seconds.
 */
export interface AutoMessageModalAction {
	ownerId: Snowflake;
	channelId: Snowflake;
	/** The interval, in milliseconds. */
	interval: number;
	mentions: boolean;
}

/**
 * Builds the custom ID of the modal of `/automessage enable`.
 *
 * @remarks The options of the command are in the custom ID, which a modal sends back, so nothing waits in memory nor in
 * Redis and any process can read the submission.
 */
export function encodeAutoMessageModalId(action: AutoMessageModalAction): string {
	const interval = seconds.fromMilliseconds(action.interval);
	return encodeCustomId(AutoMessageHandlerName, action.ownerId, `enable:${action.channelId}:${interval}:${action.mentions ? 1 : 0}`);
}

/**
 * Reads what {@linkcode encodeAutoMessageModalId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the modal.
 */
export function decodeAutoMessageModalId(content: unknown): AutoMessageModalAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const match = /^enable:(\d{17,20}):(\d{1,7}):([01])$/.exec(decoded.action);
	if (match === null) return null;

	return { ownerId: decoded.sessionId, channelId: match[1], interval: seconds(Number(match[2])), mentions: match[3] === '1' };
}
