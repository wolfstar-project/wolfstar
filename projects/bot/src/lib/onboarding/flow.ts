import { sortOnboardingStages, type OnboardingStage, type OnboardingVerification } from 'wolfstar-database';

/**
 * How far before the member's join a row may have been written and still be of this stay: the clock of the database
 * and the one of Discord are not the same.
 */
export const OnboardingStayTolerance = 2000;

/**
 * Keeps the rows of a member's current stay in the guild: the rows of an earlier stay, before they left and joined
 * again, say nothing about what they passed now.
 *
 * @param verifications - The member's rows.
 * @param joinedAt - When the member joined, `null` when Discord did not say: every row is kept then.
 */
export function selectCurrentStay(verifications: readonly OnboardingVerification[], joinedAt: number | null): OnboardingVerification[] {
	if (joinedAt === null) return [...verifications];
	return verifications.filter((verification) => verification.createdAt >= joinedAt - OnboardingStayTolerance);
}

/**
 * Where a member is in the onboarding of a guild:
 * - `Done`: they passed every enabled stage, or there is none.
 * - `Waiting`: they are in a stage now.
 * - `Start`: the next stage can start.
 * - `AwaitNativeOnboarding`: the next stage starts once they complete Discord's onboarding.
 * - `Failed`: they failed the next stage; `retry` says whether pressing the button starts it again.
 */
export type OnboardingStep =
	| { readonly kind: 'Done' }
	| { readonly kind: 'Waiting'; readonly stage: OnboardingStage; readonly verification: OnboardingVerification }
	| { readonly kind: 'Start'; readonly stage: OnboardingStage }
	| { readonly kind: 'AwaitNativeOnboarding'; readonly stage: OnboardingStage }
	| { readonly kind: 'Failed'; readonly stage: OnboardingStage; readonly verification: OnboardingVerification; readonly retry: boolean };

/**
 * Works out where a member is: the stages run in `position` order, and one starts only after the member passed every
 * enabled stage before it. A `Join` stage starts at once, a `NativeOnboarding` one once the member completed Discord's
 * onboarding.
 *
 * @param stages - The stages of the guild.
 * @param verifications - The member's rows of this stay, see {@linkcode selectCurrentStay}.
 * @param completedNativeOnboarding - Whether the member has Discord's `CompletedOnboarding` flag.
 */
export function getOnboardingStep(
	stages: readonly OnboardingStage[],
	verifications: readonly OnboardingVerification[],
	completedNativeOnboarding: boolean
): OnboardingStep {
	for (const stage of sortOnboardingStages(stages)) {
		if (!stage.enabled) continue;

		const rows = verifications.filter((verification) => verification.stageId === stage.id);
		if (rows.some((verification) => verification.status === 'Passed')) continue;

		const latest = rows.at(-1);
		if (latest?.status === 'Waiting') return { kind: 'Waiting', stage, verification: latest };
		// A kicked member is gone, and joins again as a new stay: the others may press the button again.
		if (latest?.status === 'Failed') return { kind: 'Failed', stage, verification: latest, retry: stage.failureAction !== 'Kick' };
		if (stage.trigger === 'NativeOnboarding' && !completedNativeOnboarding) return { kind: 'AwaitNativeOnboarding', stage };
		return { kind: 'Start', stage };
	}

	return { kind: 'Done' };
}

/**
 * What an answer of a member does to their row:
 * - `Pass`: the answer is right.
 * - `Wrong`: it is not, and they have `attemptsLeft` more.
 * - `Fail`: it is not, and it was their last attempt.
 */
export type OnboardingAnswerOutcome =
	| { readonly kind: 'Pass' }
	| { readonly kind: 'Wrong'; readonly attemptsLeft: number }
	| { readonly kind: 'Fail' };

/**
 * Decides what an answer does, from the attempts the row had before it.
 */
export function decideOnboardingAnswer(
	stage: Pick<OnboardingStage, 'maxAttempts'>,
	verification: Pick<OnboardingVerification, 'attempts'>,
	correct: boolean
): OnboardingAnswerOutcome {
	if (correct) return { kind: 'Pass' };

	const attempts = verification.attempts + 1;
	return attempts >= stage.maxAttempts ? { kind: 'Fail' } : { kind: 'Wrong', attemptsLeft: stage.maxAttempts - attempts };
}

/**
 * When the time limit of a member's stage runs out, in milliseconds since the epoch, or `null` when it has none.
 */
export function getOnboardingDeadline(
	stage: Pick<OnboardingStage, 'timeLimit'>,
	verification: Pick<OnboardingVerification, 'createdAt'>
): number | null {
	return stage.timeLimit === 0 ? null : verification.createdAt + stage.timeLimit * 1000;
}

/**
 * Whether the time limit of a member's stage ran out.
 */
export function isOnboardingExpired(
	stage: Pick<OnboardingStage, 'timeLimit'>,
	verification: Pick<OnboardingVerification, 'createdAt'>,
	now: number
): boolean {
	const deadline = getOnboardingDeadline(stage, verification);
	return deadline !== null && now >= deadline;
}

/**
 * Why a member failed a stage: too many wrong answers, or the time limit ran out.
 */
export type OnboardingFailureReason = 'Attempts' | 'TimeLimit';

/**
 * Why a member who waits on a stage fails it now, `null` when they can still pass it.
 *
 * @remarks A member who used every attempt still waits when Discord refused the failure action: the row is resolved
 * only once the action is taken, so it can be tried again. Such a member is never shown the challenge again.
 */
export function getOnboardingFailureReason(
	stage: Pick<OnboardingStage, 'maxAttempts' | 'timeLimit'>,
	verification: Pick<OnboardingVerification, 'attempts' | 'createdAt'>,
	now: number
): OnboardingFailureReason | null {
	if (verification.attempts >= stage.maxAttempts) return 'Attempts';
	return isOnboardingExpired(stage, verification, now) ? 'TimeLimit' : null;
}

/**
 * The emojis an `Emoji` stage picks from, with the name the member is asked for.
 */
export const OnboardingEmojis = [
	{ emoji: '🍎', name: 'apple' },
	{ emoji: '🐶', name: 'dog' },
	{ emoji: '🚗', name: 'car' },
	{ emoji: '🌙', name: 'moon' },
	{ emoji: '⚽', name: 'ball' },
	{ emoji: '🎵', name: 'note' },
	{ emoji: '🌵', name: 'cactus' },
	{ emoji: '🍕', name: 'pizza' },
	{ emoji: '🐟', name: 'fish' },
	{ emoji: '🔑', name: 'key' }
] as const;

export type OnboardingEmoji = (typeof OnboardingEmojis)[number];

/**
 * How many buttons an `Emoji` stage shows.
 */
export const OnboardingEmojiOptions = 5;

/**
 * The emoji challenge of a member's row at an attempt: the emoji they are asked for, and the buttons, in order.
 *
 * @remarks It follows from the row and the attempt alone, so the click is checked on any process without storing
 * anything, and every wrong answer shows new buttons.
 */
export function getOnboardingEmojiChallenge(verificationId: string, attempts: number): { target: number; options: OnboardingEmoji[] } {
	const random = createRandom(hash(`${verificationId}:${attempts}`));
	const pool = [...OnboardingEmojis];
	for (let index = pool.length - 1; index > 0; index--) {
		const other = Math.floor(random() * (index + 1));
		[pool[index], pool[other]] = [pool[other]!, pool[index]!];
	}

	const options = pool.slice(0, OnboardingEmojiOptions);
	return { target: Math.floor(random() * options.length), options };
}

function hash(text: string): number {
	let value = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		value ^= text.charCodeAt(index);
		value = Math.imul(value, 0x01000193);
	}
	return value >>> 0;
}

function createRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}
