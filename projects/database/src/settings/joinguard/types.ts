import type { Snowflake } from 'discord-api-types/v10';
import type { Models } from '../../index.js';
import type { TableSettingKey } from '../storage.js';
import type { ReadonlyGuildData } from '../types.js';

/**
 * The settings of the join guard of a guild, as `GuildData` has them.
 */
export type JoinGuardSettings = Pick<ReadonlyGuildData, TableSettingKey<'GuildJoinGuard'>>;

/**
 * The case a rule of the join guard opens on a member it matches, as the `JoinGuardHardAction` enum stores it.
 */
export type JoinGuardHardAction = NonNullable<Models.public_GuildJoinGuardRule['hardAction']>;

/**
 * The values of {@linkcode JoinGuardHardAction}, the mildest first.
 */
export const JoinGuardHardActions = ['Kick', 'Ban'] as const satisfies readonly JoinGuardHardAction[];

/**
 * What became of a member the join guard stopped, as the `JoinGuardCheckpointStatus` enum stores it.
 */
export type JoinGuardCheckpointStatus = Models.public_JoinGuardCheckpoint['status'];

/**
 * What decided what became of a member the join guard stopped, as the `JoinGuardResolution` enum stores it: the rule
 * (a kick or a ban at once), the checkpoint page, its timeout, or a moderator.
 */
export type JoinGuardResolution = NonNullable<Models.public_JoinGuardCheckpoint['resolution']>;

/**
 * What the website asks the bot to do, as the `JoinGuardRequestKind` enum stores it.
 */
export type JoinGuardRequestKind = Models.public_JoinGuardRequest['kind'];

/**
 * What banned an account of the shared ban list, as the `JoinGuardSharedBanSource` enum stores it.
 */
export type JoinGuardSharedBanSource = Models.public_JoinGuardSharedBan['source'];

/**
 * The most rules a guild has.
 */
export const MaximumJoinGuardRules = 10;

/**
 * The longest name of a rule, and the longest text its `nameContains` condition looks for.
 */
export const MaximumJoinGuardRuleNameLength = 32;
export const MaximumJoinGuardNameContainsLength = 32;

/**
 * The longest direct message a guild writes for the members the guard stops, and the longest reason of a kick the
 * dashboard asks for.
 */
export const MaximumJoinGuardDirectMessageLength = 500;
export const MaximumJoinGuardReasonLength = 500;

/**
 * How long, in seconds, a member who waits at the checkpoint has to pass it before they are kicked; `0` never kicks.
 */
export const JoinGuardCheckpointTimeoutLimits = { minimum: 3600, maximum: 604_800 } as const;

/**
 * Whether a number of seconds is a timeout of the checkpoint a guild can set, see
 * {@linkcode JoinGuardCheckpointTimeoutLimits}.
 */
export function isJoinGuardCheckpointTimeout(seconds: number): boolean {
	return (
		Number.isSafeInteger(seconds) &&
		(seconds === 0 || (seconds >= JoinGuardCheckpointTimeoutLimits.minimum && seconds <= JoinGuardCheckpointTimeoutLimits.maximum))
	);
}

/**
 * The trust the checkpoint page measures, `0` (not trusted) to `3` (very trusted), and the lowest a guild asks for to
 * let a member pass.
 */
export const JoinGuardTrustLimits = { minimum: 0, maximum: 3 } as const;
export const JoinGuardMinimumTrustLimits = { minimum: 1, maximum: 3 } as const;

/**
 * A rule of the join guard of a guild. Every condition it sets must match a member who joins, and then each action
 * it sets is taken.
 */
export interface JoinGuardRule {
	id: string;
	guildId: Snowflake;
	name: string;
	enabled: boolean;

	/** Matches an account created less than this many seconds ago. */
	accountAgeMax: number | null;
	/** Matches an account with no avatar of its own. */
	defaultAvatar: boolean;
	/** Matches an account whose name looks generated. */
	generatedName: boolean;
	/** Matches an account whose username or global name has this text, whatever its case and look-alike letters. */
	nameContains: string | null;
	/** Matches an app account that is not a verified bot. */
	unverifiedBot: boolean;

	sendToCheckpoint: boolean;
	roleId: Snowflake | null;
	directMessage: boolean;
	alertChannelId: Snowflake | null;
	hardAction: JoinGuardHardAction | null;

	/** When the rule was made, in milliseconds. */
	createdAt: number;
}

/**
 * A member the join guard stopped, and what became of them: the queue of the dashboard.
 */
export interface JoinGuardCheckpoint {
	id: string;
	guildId: Snowflake;
	userId: Snowflake;
	/** The rule that stopped the member, `null` once it is deleted. */
	ruleId: string | null;
	ruleName: string;
	status: JoinGuardCheckpointStatus;
	/** `null` while the member waits, and when they left. */
	resolution: JoinGuardResolution | null;
	moderatorId: Snowflake | null;
	caseId: number | null;

	/** The signals the rule saw: when the account was made, in milliseconds, and what it looked like. */
	accountCreatedAt: number;
	defaultAvatar: boolean;
	generatedName: boolean;

	/** What the checkpoint page measured, when the member passed it. */
	trust: number | null;
	linkedAccounts: number;

	/** In milliseconds. */
	createdAt: number;
	expiresAt: number | null;
	resolvedAt: number | null;
}

/**
 * What a member the join guard stopped is recorded with.
 */
export interface JoinGuardCheckpointCreateData {
	userId: Snowflake;
	ruleId: string;
	ruleName: string;
	/** `Waiting` for a member sent to the checkpoint, `Kicked` or `Banned` for one a rule removed. */
	status: Extract<JoinGuardCheckpointStatus, 'Waiting' | 'Kicked' | 'Banned'>;
	caseId: number | null;
	accountCreatedAt: number;
	defaultAvatar: boolean;
	generatedName: boolean;
	/** When the timeout kicks a member who waits, in milliseconds; `null` for never. */
	expiresAt: number | null;
}

/**
 * What became of a member who waited at the checkpoint.
 */
export interface JoinGuardCheckpointResolveData {
	status: Exclude<JoinGuardCheckpointStatus, 'Waiting'>;
	resolution: JoinGuardResolution | null;
	moderatorId?: Snowflake | null;
	caseId?: number | null;
	trust?: number | null;
	linkedAccounts?: number;
}

/**
 * A request of the website, as it is stored: what is in it is not trusted, see the bot's `parseJoinGuardRequest`.
 */
export interface JoinGuardRequestRecord {
	id: string;
	guildId: Snowflake;
	kind: JoinGuardRequestKind;
	userId: Snowflake | null;
	checkpointId: string | null;
	moderatorId: Snowflake | null;
	trust: number | null;
	linkedAccounts: number | null;
	reason: string | null;
	createdAt: number;
}

/**
 * How many members the join guard of a guild stopped since a time, and how many wait at its checkpoint now.
 */
export interface JoinGuardCheckpointCounts {
	stopped: number;
	waiting: number;
}
