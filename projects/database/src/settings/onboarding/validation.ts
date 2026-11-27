import {
	MaximumOnboardingAnswerLength,
	MaximumOnboardingAnswers,
	MaximumOnboardingQuestionLength,
	MaximumOnboardingStageNameLength,
	MaximumOnboardingStages,
	OnboardingAttemptLimits,
	OnboardingFailureTimeoutLimits,
	OnboardingTimeLimitLimits,
	type OnboardingChallenge,
	type OnboardingStage,
	type OnboardingStageInput
} from './types.js';

/**
 * Why a stage cannot be saved. The website refuses the same, with the same rules.
 */
export type OnboardingStageProblem =
	| 'NameLength'
	| 'NameTaken'
	| 'TooManyStages'
	| 'QuestionRequired'
	| 'QuestionLength'
	| 'AnswersCount'
	| 'AnswerLength'
	| 'QuestionNotAllowed'
	| 'MaxAttempts'
	| 'TimeLimit'
	| 'FailureTimeoutRequired'
	| 'FailureTimeoutNotAllowed'
	| 'FailureTimeout'
	| 'CaptchaUnavailable';

/**
 * Trims what an editor typed: the name, the question and every answer, and drops the answers left empty.
 */
export function normalizeOnboardingStageInput(input: OnboardingStageInput): OnboardingStageInput {
	const question = input.question?.trim() ?? '';
	return {
		...input,
		name: input.name.trim(),
		question: question.length === 0 ? null : question,
		answers: input.answers.map((answer) => answer.trim()).filter((answer) => answer.length > 0)
	};
}

/**
 * Whether two names of stages are the same whatever their case, as the unique index of the table compares them.
 */
export function isSameOnboardingStageName(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

/**
 * What else a stage is checked against.
 */
export interface OnboardingStageContext {
	/** The other stages of the guild: the stage being edited is left out. */
	readonly others: readonly Pick<OnboardingStage, 'name'>[];
	/** Whether the stage is new, which counts it against the most stages a guild has. */
	readonly creating: boolean;
	/** The challenge the stage has now, `null` for a new one: a stage that has a challenge may keep it. */
	readonly previousChallenge: OnboardingChallenge | null;
	/** Whether the website serves the `Captcha` challenge yet. */
	readonly captchaAvailable: boolean;
}

/**
 * Checks a stage an editor wants to save, normalized with {@linkcode normalizeOnboardingStageInput}.
 *
 * @returns Every problem it has, none when it can be saved.
 */
export function validateOnboardingStage(input: OnboardingStageInput, context: OnboardingStageContext): OnboardingStageProblem[] {
	const problems: OnboardingStageProblem[] = [];
	if (input.name.length < 1 || input.name.length > MaximumOnboardingStageNameLength) problems.push('NameLength');
	if (context.others.some((stage) => isSameOnboardingStageName(stage.name, input.name))) problems.push('NameTaken');
	if (context.creating && context.others.length >= MaximumOnboardingStages) problems.push('TooManyStages');

	problems.push(...validateChallenge(input, context));

	if (!isWithin(input.maxAttempts, OnboardingAttemptLimits)) problems.push('MaxAttempts');
	if (input.timeLimit !== 0 && !isWithin(input.timeLimit, OnboardingTimeLimitLimits)) problems.push('TimeLimit');

	if (input.failureAction === 'Timeout') {
		if (input.failureTimeout === null) problems.push('FailureTimeoutRequired');
		else if (!isWithin(input.failureTimeout, OnboardingFailureTimeoutLimits)) problems.push('FailureTimeout');
	} else if (input.failureTimeout !== null) {
		problems.push('FailureTimeoutNotAllowed');
	}

	return problems;
}

function validateChallenge(input: OnboardingStageInput, context: OnboardingStageContext): OnboardingStageProblem[] {
	const problems: OnboardingStageProblem[] = [];
	// Only a new choice of the captcha is refused: a stage that has it stays editable, and can be switched off.
	if (input.challenge === 'Captcha' && context.previousChallenge !== 'Captcha' && !context.captchaAvailable) {
		problems.push('CaptchaUnavailable');
	}

	if (input.challenge !== 'Question') {
		if (input.question !== null || input.answers.length > 0) problems.push('QuestionNotAllowed');
		return problems;
	}

	if (input.question === null) problems.push('QuestionRequired');
	else if (input.question.length > MaximumOnboardingQuestionLength) problems.push('QuestionLength');
	if (input.answers.length < 1 || input.answers.length > MaximumOnboardingAnswers) problems.push('AnswersCount');
	if (input.answers.some((answer) => answer.length > MaximumOnboardingAnswerLength)) problems.push('AnswerLength');
	return problems;
}

function isWithin(value: number, limits: { readonly minimum: number; readonly maximum: number }) {
	return Number.isSafeInteger(value) && value >= limits.minimum && value <= limits.maximum;
}

/**
 * Whether a member's answer to a `Question` stage is one of its answers, whatever the case after trimming.
 */
export function isOnboardingAnswerCorrect(answers: readonly string[], answer: string): boolean {
	const given = answer.trim().toLowerCase();
	return given.length > 0 && answers.some((expected) => expected.trim().toLowerCase() === given);
}

/**
 * Sorts stages in the order they run: by position, then by ID.
 */
export function sortOnboardingStages<Stage extends Pick<OnboardingStage, 'id' | 'position'>>(stages: readonly Stage[]): Stage[] {
	return [...stages].sort((a, b) => a.position - b.position || compareIds(a.id, b.id));
}

function compareIds(a: string, b: string) {
	const left = BigInt(a);
	const right = BigInt(b);
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The IDs of the stages once one moves by an offset, in their new order: a stage at an end stays there.
 *
 * @returns The order, `null` when no stage has that ID.
 */
export function moveOnboardingStage(stages: readonly Pick<OnboardingStage, 'id' | 'position'>[], stageId: string, offset: number): string[] | null {
	const order = sortOnboardingStages(stages).map((stage) => stage.id);
	const from = order.indexOf(stageId);
	if (from === -1) return null;

	const to = Math.min(Math.max(from + offset, 0), order.length - 1);
	order.splice(from, 1);
	order.splice(to, 0, stageId);
	return order;
}
