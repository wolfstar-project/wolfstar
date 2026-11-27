import type { Snowflake } from 'discord-api-types/v10';

/**
 * What a moderation case holds besides the columns of its table, which is owned outside this repository: the extra
 * data of its type (the roles a mute took away), the message it is about, and what the moderators add to it later, a
 * note only they read and a proof.
 */
export interface ModerationCaseData {
	caseId: number;
	extraData: unknown;
	/** The message the case is about, `null` when it has none. */
	message: { channelId: Snowflake; messageId: Snowflake } | null;
	/** The note of the moderators, which the user of the case is never told, `null` when it has none. */
	staffNote: string | null;
	/** The message of the bot that holds the file a moderator gave as the proof, `null` when it has none. */
	proof: { channelId: Snowflake; messageId: Snowflake } | null;
}

export type ModerationCaseDataInput = Pick<ModerationCaseData, 'extraData' | 'message'>;

/**
 * What the moderators add to a case. A key that is left out keeps what the case has.
 */
export type ModerationCaseDetailsInput = Partial<Pick<ModerationCaseData, 'staffNote' | 'proof'>>;

/**
 * What an edit of a case can change. `status` is its closing, and `closeReason` why it was closed.
 */
export const ModerationCaseChangeFields = ['reason', 'duration', 'staffNote', 'proof', 'status', 'closeReason'] as const;
export type ModerationCaseChangeField = (typeof ModerationCaseChangeFields)[number];

/**
 * One thing an edit changed, as texts: a duration is its milliseconds, a proof the link of its message.
 */
export interface ModerationCaseChange {
	field: ModerationCaseChangeField;
	before: string | null;
	after: string | null;
}

/**
 * An edit of a case: who made it, when, and what it changed.
 */
export interface ModerationCaseEdit {
	id: string;
	caseId: number;
	moderatorId: Snowflake;
	/** In milliseconds. */
	createdAt: number;
	changes: ModerationCaseChange[];
}

/**
 * The most edits of a case that are kept, the oldest goes when one more is made.
 */
export const MaximumModerationCaseEdits = 50;
