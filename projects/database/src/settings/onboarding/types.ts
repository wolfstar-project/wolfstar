import type { Snowflake } from 'discord-api-types/v10';
import type { Models } from '../../index.js';

/**
 * When a stage of the onboarding starts, as the `OnboardingStageTrigger` enum stores it: when the member joins, or
 * when they complete Discord's own onboarding of the server.
 */
export type OnboardingStageTrigger = Models.public_GuildOnboardingStage['trigger'];

/**
 * What a member does to pass a stage, as the `OnboardingChallenge` enum stores it.
 */
export type OnboardingChallenge = Models.public_GuildOnboardingStage['challenge'];

/**
 * What happens to a member who fails a stage, as the `OnboardingFailureAction` enum stores it.
 */
export type OnboardingFailureAction = Models.public_GuildOnboardingStage['failureAction'];

/**
 * Where a member is in a stage, as the `OnboardingVerificationStatus` enum stores it.
 */
export type OnboardingVerificationStatus = Models.public_OnboardingVerification['status'];

export const OnboardingStageTriggers = ['Join', 'NativeOnboarding'] as const satisfies readonly OnboardingStageTrigger[];
export const OnboardingChallenges = ['Button', 'Emoji', 'Question', 'Captcha'] as const satisfies readonly OnboardingChallenge[];
export const OnboardingFailureActions = ['None', 'Kick', 'Timeout'] as const satisfies readonly OnboardingFailureAction[];

/**
 * The most stages a guild has.
 */
export const MaximumOnboardingStages = 5;

/**
 * The longest name of a stage. A name has one character at least, and is unique per guild whatever its case.
 */
export const MaximumOnboardingStageNameLength = 32;

/**
 * The longest question of a `Question` stage, how many answers it takes at most and the longest of them.
 */
export const MaximumOnboardingQuestionLength = 200;
export const MaximumOnboardingAnswers = 5;
export const MaximumOnboardingAnswerLength = 100;

/**
 * How many wrong answers a member has before they fail a stage.
 */
export const OnboardingAttemptLimits = { minimum: 1, maximum: 5 } as const;

/**
 * The seconds a member has to pass a stage: `0` for no limit, else within these.
 */
export const OnboardingTimeLimitLimits = { minimum: 60, maximum: 86_400 } as const;

/**
 * The seconds of the timeout of a `Timeout` failure: a minute to 28 days, Discord's longest.
 */
export const OnboardingFailureTimeoutLimits = { minimum: 60, maximum: 2_419_200 } as const;

/**
 * The row of a guild's onboarding. The dashboard writes it too.
 */
export interface OnboardingSettings {
	readonly enabled: boolean;
	/** Where every pass, failure and action is logged. */
	readonly logChannelId: Snowflake | null;
	/** Where the bot posted the verification message, and that message, which only the bot writes. */
	readonly channelId: Snowflake | null;
	readonly messageId: Snowflake | null;
	/** Grows by one on every change of the log channel, the message or a stage; `0` when the guild has no row. */
	readonly revision: number;
}

/**
 * What an editor sets on a stage.
 */
export interface OnboardingStageInput {
	readonly name: string;
	readonly enabled: boolean;
	readonly trigger: OnboardingStageTrigger;
	readonly challenge: OnboardingChallenge;
	/** `Question` only. */
	readonly question: string | null;
	/** `Question` only, compared whatever the case after trimming. */
	readonly answers: readonly string[];
	readonly maxAttempts: number;
	/** Seconds, `0` for none. */
	readonly timeLimit: number;
	/** Given when the member passes. */
	readonly roleId: Snowflake | null;
	readonly failureAction: OnboardingFailureAction;
	/** `Timeout` only, seconds. */
	readonly failureTimeout: number | null;
}

/**
 * A stage of a guild's onboarding.
 */
export interface OnboardingStage extends OnboardingStageInput {
	readonly id: string;
	readonly guildId: Snowflake;
	/** 0-based; the stages run in this order, then by ID. */
	readonly position: number;
	readonly createdAt: number;
}

/**
 * A guild's onboarding as one editor reads it: the stages go with the revision read before them.
 */
export interface OnboardingConfig {
	readonly settings: OnboardingSettings;
	readonly stages: readonly OnboardingStage[];
}

/**
 * A member and a stage, written by the bot only.
 */
export interface OnboardingVerification {
	readonly id: string;
	readonly guildId: Snowflake;
	readonly userId: Snowflake;
	/** `null` once the stage is deleted. */
	readonly stageId: string | null;
	/** The stage's name when it started, kept for the log. */
	readonly stageName: string;
	readonly status: OnboardingVerificationStatus;
	readonly attempts: number;
	readonly createdAt: number;
	readonly resolvedAt: number | null;
}

/**
 * What the onboarding of a guild did since a moment, by when the members passed or failed, and who waits now.
 */
export interface OnboardingCounts {
	readonly passed: number;
	readonly failed: number;
	readonly waiting: number;
}
