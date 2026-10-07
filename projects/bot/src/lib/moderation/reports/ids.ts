import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the reports, which is also the first part of their custom IDs.
 */
export const ReportHandlerName = 'report';

/**
 * What the moderators can do with a report from its buttons.
 */
export const ReportModerationVerbs = ['warn', 'timeout', 'kick', 'ban'] as const;
export type ReportModerationVerb = (typeof ReportModerationVerbs)[number];

/**
 * What a component or a modal of a report does:
 *
 * - `new`: the modal a member writes the reason of their report in.
 * - `warn`, `timeout`, `kick`, `ban`: a button that opens the modal of a moderation action, and that modal.
 * - `delete`: deletes the reported message.
 * - `dismiss`: closes the report without an action.
 */
export type ReportVerb = 'new' | ReportModerationVerb | 'delete' | 'dismiss';

export interface ReportAction {
	verb: ReportVerb;

	/**
	 * The user who was reported.
	 */
	targetId: Snowflake;

	/**
	 * The channel and the message that were reported, `null` when a user was reported and not one of their messages.
	 */
	channelId: Snowflake | null;
	messageId: Snowflake | null;

	/**
	 * Whether this is the modal of the verb, and not the button that opens it.
	 */
	submit: boolean;
}

/**
 * Builds the custom ID of a component or a modal of a report, `report.<targetId>.<verb>:<channelId>:<messageId>:<submit>`.
 *
 * @remarks Everything a click needs is in the ID, so a report keeps working after a restart and on any process.
 */
export function encodeReportId(action: ReportAction) {
	return encodeCustomId(
		ReportHandlerName,
		action.targetId,
		`${action.verb}:${action.channelId ?? 0}:${action.messageId ?? 0}:${action.submit ? 1 : 0}`
	);
}

const Verbs = new Set<string>(['new', ...ReportModerationVerbs, 'delete', 'dismiss']);
const SnowflakeRegExp = /^\d{17,20}$/;

/**
 * Reads what {@linkcode encodeReportId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of a report.
 */
export function decodeReportId(content: unknown): ReportAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null || !SnowflakeRegExp.test(decoded.sessionId)) return null;

	const [verb, channelId, messageId, submit] = decoded.action.split(':');
	if (verb === undefined || !Verbs.has(verb) || channelId === undefined || messageId === undefined) return null;

	const hasMessage = SnowflakeRegExp.test(channelId) && SnowflakeRegExp.test(messageId);
	if (!hasMessage && (channelId !== '0' || messageId !== '0')) return null;

	return {
		verb: verb as ReportVerb,
		targetId: decoded.sessionId,
		channelId: hasMessage ? channelId : null,
		messageId: hasMessage ? messageId : null,
		submit: submit === '1'
	};
}

export function isReportModerationVerb(verb: ReportVerb): verb is ReportModerationVerb {
	return ReportModerationVerbs.includes(verb as ReportModerationVerb);
}
