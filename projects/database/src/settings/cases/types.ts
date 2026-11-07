import type { Snowflake } from 'discord-api-types/v10';

/**
 * What a moderation case holds besides the columns of its table, which is owned outside this repository: the extra
 * data of its type (the roles a mute took away) and the message it is about.
 */
export interface ModerationCaseData {
	caseId: number;
	extraData: unknown;
	/** The message the case is about, `null` when it has none. */
	message: { channelId: Snowflake; messageId: Snowflake } | null;
}

export type ModerationCaseDataInput = Pick<ModerationCaseData, 'extraData' | 'message'>;
