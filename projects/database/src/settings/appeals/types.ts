import type { Snowflake } from 'discord-api-types/v10';

/**
 * The most forms a guild has.
 */
export const MaximumAppealForms = 10;

/**
 * The most questions a form has, and how many it needs that ask something: one.
 */
export const MaximumAppealQuestions = 5;

/**
 * The most files an appeal carries, and the largest of them in bytes.
 */
export const MaximumAppealFiles = 5;
export const MaximumAppealFileSize = 8 * 1024 * 1024;

interface AppealQuestionBase {
	/**
	 * Generated, and kept when the question is edited, so the answers keep their question.
	 */
	id: string;
}

/**
 * A question answered with text.
 */
export interface AppealTextQuestion extends AppealQuestionBase {
	kind: 'text';
	label: string;
	placeholder?: string;
	help?: string;
	/**
	 * Whether it is a paragraph, not a line.
	 */
	long: boolean;
	maxLength: number;
	required: boolean;
}

/**
 * A question answered by picking among fixed options, between `min` and `max` of them.
 */
export interface AppealChoiceQuestion extends AppealQuestionBase {
	kind: 'choice';
	label: string;
	help?: string;
	options: { label: string; value: string }[];
	min: number;
	max: number;
	required: boolean;
}

/**
 * A question answered with files, between `min` and `max` of them, which the website keeps.
 */
export interface AppealAttachmentQuestion extends AppealQuestionBase {
	kind: 'attachment';
	label: string;
	help?: string;
	min: number;
	max: number;
	imagesOnly: boolean;
}

/**
 * A block of text that asks nothing.
 */
export interface AppealDisplayQuestion extends AppealQuestionBase {
	kind: 'display';
	content: string;
}

export type AppealQuestion = AppealTextQuestion | AppealChoiceQuestion | AppealAttachmentQuestion | AppealDisplayQuestion;

/**
 * A file of an answer: the website keeps it under `key`, `appeals/<guildId>/<userId>/<uuid>`, and the bot never reads it.
 */
export interface AppealFile {
	key: string;
	name: string;
	size: number;
	contentType: string;
}

/**
 * The answer to a question, with the label it had, so a question that is renamed or deleted still reads: the labels
 * picked of a `choice`, the text of a `text`, the files of an `attachment`.
 */
export type AppealAnswer =
	| { questionId: string; kind: 'text'; label: string; value: string }
	| { questionId: string; kind: 'choice'; label: string; value: string[] }
	| { questionId: string; kind: 'attachment'; label: string; value: AppealFile[] };

/**
 * A form of the appeals of a guild.
 */
export interface AppealForm {
	/**
	 * `null` for the built-in form of a guild that has no enabled one.
	 */
	id: string | null;
	guildId: Snowflake;
	name: string;
	description: string | null;
	icon: string | null;
	enabled: boolean;
	lockReason: string | null;
	/**
	 * The types of case it takes, every one the settings allow when empty.
	 */
	types: number[];
	requiredRoles: Snowflake[];
	restrictedRoles: Snowflake[];
	questions: AppealQuestion[];
	position: number;
}

/**
 * Who a guild keeps from appealing.
 */
export interface AppealBlock {
	guildId: Snowflake;
	userId: Snowflake;
	reason: string | null;
	moderatorId: Snowflake | null;
	automatic: boolean;
	/** In milliseconds. */
	createdAt: number;
}

/**
 * What the dashboard asks the bot to do with an appeal.
 */
export const AppealRequestKinds = ['Approve', 'Deny', 'Block', 'Unblock'] as const;
export type AppealRequestKind = (typeof AppealRequestKinds)[number];

/**
 * A request of the dashboard: `appealId` for `Approve` and `Deny`, `userId` for `Block` and `Unblock`.
 */
export interface AppealRequest {
	id: string;
	guildId: Snowflake;
	kind: AppealRequestKind;
	appealId: string | null;
	userId: Snowflake | null;
	moderatorId: Snowflake;
	reason: string | null;
}
