import type { Snowflake } from 'discord-api-types/v10';

/**
 * What became of a report, as the `ReportStatus` enum stores it: `Open` until a moderator acts on it (`Actioned`) or
 * closes it without an action (`Dismissed`).
 */
export const ReportStatuses = ['Open', 'Actioned', 'Dismissed'] as const;
export type ReportStatus = (typeof ReportStatuses)[number];

/**
 * A report a member made of another member, or of one of their messages. Snowflakes are strings, as in `GuildData`.
 */
export interface Report {
	id: string;
	guildId: Snowflake;
	reporterId: Snowflake;
	targetId: Snowflake;

	/**
	 * The name of the reported user when they were reported.
	 */
	targetTag: string;

	/**
	 * The reported message, `null` for both when a user was reported and not one of their messages.
	 */
	channelId: Snowflake | null;
	messageId: Snowflake | null;
	reason: string;

	/**
	 * What the reported message said when it was reported, and the links to its attachments.
	 */
	content: string | null;
	attachments: string[];

	/**
	 * Whether the moderators are not shown who made the report.
	 */
	anonymous: boolean;
	status: ReportStatus;

	/**
	 * What the moderator who closed the report did, the case it made, and who they are.
	 */
	action: string | null;
	caseId: number | null;
	moderatorId: Snowflake | null;

	/**
	 * When the report was made and when it was closed, in milliseconds.
	 */
	createdAt: number;
	closedAt: number | null;
}

/**
 * What a report is created with.
 */
export type ReportCreateData = Pick<
	Report,
	'reporterId' | 'targetId' | 'targetTag' | 'channelId' | 'messageId' | 'reason' | 'content' | 'attachments' | 'anonymous'
>;

/**
 * What a report is closed with.
 */
export interface ReportCloseData {
	status: Exclude<ReportStatus, 'Open'>;
	action: string | null;
	caseId: number | null;
	moderatorId: Snowflake;
}
