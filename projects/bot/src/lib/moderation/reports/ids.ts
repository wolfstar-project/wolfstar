import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the reports, which is also the first part of their custom IDs.
 */
export const ReportHandlerName = 'report';

/**
 * The moderation actions the moderators can take from a report: `warn`, `timeout` and `kick` have a button, the others are in
 * its menu.
 */
export const ReportModerationVerbs = ['warn', 'timeout', 'kick', 'note', 'mute', 'softban', 'ban'] as const;
export type ReportModerationVerb = (typeof ReportModerationVerbs)[number];

/**
 * What the menu of a report offers besides its buttons, in the order it lists them.
 */
export const ReportMenuVerbs = ['note', 'mute', 'softban', 'ban', 'block'] as const;
export type ReportMenuVerb = (typeof ReportMenuVerbs)[number];

/**
 * What a component or a modal of a report does:
 *
 * - `new`: the modal a member writes the reason of their report in.
 * - `warn`, `timeout`, `kick`: a button that opens the modal of a moderation action, and that modal.
 * - `menu`: the select menu of the other actions, the action is its selected value.
 * - `note`, `mute`, `softban`, `ban`: the modal of a moderation action picked in the menu.
 * - `block`: stops the member who made the report from making more of them.
 * - `delete`: deletes the reported message.
 * - `dismiss`: closes the report without an action.
 */
export type ReportVerb = 'new' | ReportModerationVerb | 'menu' | 'block' | 'delete' | 'dismiss';

export interface ReportAction {
	verb: ReportVerb;

	/**
	 * The ID of the report. For `new` the report does not exist yet, so it is the ID of the user who is reported.
	 */
	id: string;

	/**
	 * The message that is reported, only for `new` and when a message is reported.
	 */
	messageId: Snowflake | null;

	/**
	 * Whether this is the modal of the verb, and not the component that opens it.
	 */
	submit: boolean;
}

/**
 * Builds the custom ID of a component or a modal of a report, `report.<id>.<verb>:<messageId>:<submit>`.
 *
 * @remarks The report is read from the database by its ID, so its components keep working after a restart and on any
 * process.
 */
export function encodeReportId(action: ReportAction) {
	return encodeCustomId(ReportHandlerName, action.id, `${action.verb}:${action.messageId ?? 0}:${action.submit ? 1 : 0}`);
}

const Verbs = new Set<string>(['new', ...ReportModerationVerbs, 'menu', 'block', 'delete', 'dismiss']);
const IdRegExp = /^\d{1,20}$/;
const SnowflakeRegExp = /^\d{17,20}$/;

/**
 * Reads what {@linkcode encodeReportId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of a report.
 */
export function decodeReportId(content: unknown): ReportAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null || !IdRegExp.test(decoded.sessionId)) return null;

	const [verb, messageId, submit] = decoded.action.split(':');
	if (verb === undefined || !Verbs.has(verb) || messageId === undefined) return null;
	if (messageId !== '0' && !SnowflakeRegExp.test(messageId)) return null;

	return { verb: verb as ReportVerb, id: decoded.sessionId, messageId: messageId === '0' ? null : messageId, submit: submit === '1' };
}

export function isReportModerationVerb(verb: string): verb is ReportModerationVerb {
	return ReportModerationVerbs.includes(verb as ReportModerationVerb);
}

export function isReportMenuVerb(verb: string): verb is ReportMenuVerb {
	return ReportMenuVerbs.includes(verb as ReportMenuVerb);
}
