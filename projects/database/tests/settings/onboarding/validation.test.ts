import type { OnboardingStageInput } from '../../../src/settings/onboarding/types.js';
import {
	isOnboardingAnswerCorrect,
	moveOnboardingStage,
	normalizeOnboardingStageInput,
	sortOnboardingStages,
	validateOnboardingStage,
	type OnboardingStageContext
} from '../../../src/settings/onboarding/validation.js';

const button: OnboardingStageInput = {
	name: 'Rules',
	enabled: true,
	trigger: 'Join',
	challenge: 'Button',
	question: null,
	answers: [],
	maxAttempts: 3,
	timeLimit: 600,
	roleId: null,
	failureAction: 'None',
	failureTimeout: null
};

const question: OnboardingStageInput = { ...button, name: 'Quiz', challenge: 'Question', question: 'What is rule 1?', answers: ['Be kind'] };

const fresh: OnboardingStageContext = { others: [], creating: true, previousChallenge: null, captchaAvailable: false };

describe('validateOnboardingStage', () => {
	test('GIVEN a button stage THEN it can be saved', () => {
		expect(validateOnboardingStage(button, fresh)).toEqual([]);
	});

	test('GIVEN an empty name or one of 33 characters THEN it is refused', () => {
		expect(validateOnboardingStage({ ...button, name: '' }, fresh)).toEqual(['NameLength']);
		expect(validateOnboardingStage({ ...button, name: 'a'.repeat(33) }, fresh)).toEqual(['NameLength']);
		expect(validateOnboardingStage({ ...button, name: 'a'.repeat(32) }, fresh)).toEqual([]);
	});

	test('GIVEN the name of another stage in another case THEN it is taken', () => {
		expect(validateOnboardingStage(button, { ...fresh, others: [{ name: 'RULES' }] })).toEqual(['NameTaken']);
	});

	test('GIVEN a sixth stage THEN it is refused, but a fifth one is not', () => {
		const others = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Stage ${index}` }));
		expect(validateOnboardingStage(button, { ...fresh, others: others(4) })).toEqual([]);
		expect(validateOnboardingStage(button, { ...fresh, others: others(5) })).toEqual(['TooManyStages']);
		// Editing one of five stages adds none:
		expect(validateOnboardingStage(button, { ...fresh, others: others(5), creating: false })).toEqual([]);
	});

	test('GIVEN a question stage THEN it needs a question of 200 characters at most and 1 to 5 answers of 100 at most', () => {
		expect(validateOnboardingStage(question, fresh)).toEqual([]);
		expect(validateOnboardingStage({ ...question, question: null }, fresh)).toEqual(['QuestionRequired']);
		expect(validateOnboardingStage({ ...question, question: 'a'.repeat(201) }, fresh)).toEqual(['QuestionLength']);
		expect(validateOnboardingStage({ ...question, answers: [] }, fresh)).toEqual(['AnswersCount']);
		expect(validateOnboardingStage({ ...question, answers: ['1', '2', '3', '4', '5', '6'] }, fresh)).toEqual(['AnswersCount']);
		expect(validateOnboardingStage({ ...question, answers: ['a'.repeat(101)] }, fresh)).toEqual(['AnswerLength']);
	});

	test('GIVEN another challenge with a question or answers THEN it is refused', () => {
		expect(validateOnboardingStage({ ...button, question: 'Why?' }, fresh)).toEqual(['QuestionNotAllowed']);
		expect(validateOnboardingStage({ ...button, challenge: 'Emoji', answers: ['yes'] }, fresh)).toEqual(['QuestionNotAllowed']);
	});

	test('GIVEN attempts or a time limit out of range THEN they are refused', () => {
		expect(validateOnboardingStage({ ...button, maxAttempts: 0 }, fresh)).toEqual(['MaxAttempts']);
		expect(validateOnboardingStage({ ...button, maxAttempts: 6 }, fresh)).toEqual(['MaxAttempts']);
		expect(validateOnboardingStage({ ...button, timeLimit: 0 }, fresh)).toEqual([]);
		expect(validateOnboardingStage({ ...button, timeLimit: 59 }, fresh)).toEqual(['TimeLimit']);
		expect(validateOnboardingStage({ ...button, timeLimit: 86_401 }, fresh)).toEqual(['TimeLimit']);
	});

	test('GIVEN a failure timeout THEN it is set if and only if the action is Timeout', () => {
		expect(validateOnboardingStage({ ...button, failureAction: 'Timeout', failureTimeout: 3600 }, fresh)).toEqual([]);
		expect(validateOnboardingStage({ ...button, failureAction: 'Timeout' }, fresh)).toEqual(['FailureTimeoutRequired']);
		expect(validateOnboardingStage({ ...button, failureAction: 'Timeout', failureTimeout: 59 }, fresh)).toEqual(['FailureTimeout']);
		expect(validateOnboardingStage({ ...button, failureAction: 'Timeout', failureTimeout: 2_419_201 }, fresh)).toEqual(['FailureTimeout']);
		expect(validateOnboardingStage({ ...button, failureAction: 'Kick', failureTimeout: 3600 }, fresh)).toEqual(['FailureTimeoutNotAllowed']);
	});

	test('GIVEN the captcha before the website serves it THEN only a new choice of it is refused', () => {
		const captcha = { ...button, challenge: 'Captcha' } as const;
		expect(validateOnboardingStage(captcha, fresh)).toEqual(['CaptchaUnavailable']);
		expect(validateOnboardingStage(captcha, { ...fresh, creating: false, previousChallenge: 'Button' })).toEqual(['CaptchaUnavailable']);
		// A stage that has it stays editable:
		expect(validateOnboardingStage({ ...captcha, enabled: false }, { ...fresh, creating: false, previousChallenge: 'Captcha' })).toEqual([]);
		expect(validateOnboardingStage(captcha, { ...fresh, captchaAvailable: true })).toEqual([]);
	});
});

describe('normalizeOnboardingStageInput', () => {
	test('GIVEN spaces and empty answers THEN they are trimmed and dropped', () => {
		const normalized = normalizeOnboardingStageInput({ ...question, name: '  Quiz ', question: '   ', answers: [' Be kind ', '', '  '] });
		expect(normalized).toEqual({ ...question, name: 'Quiz', question: null, answers: ['Be kind'] });
	});
});

describe('isOnboardingAnswerCorrect', () => {
	test('GIVEN an answer in another case with spaces THEN it is correct', () => {
		expect(isOnboardingAnswerCorrect(['Be kind', 'No spam'], '  NO SPAM ')).toBe(true);
	});

	test('GIVEN another or an empty answer THEN it is wrong', () => {
		expect(isOnboardingAnswerCorrect(['Be kind'], 'Be rude')).toBe(false);
		expect(isOnboardingAnswerCorrect([''], '   ')).toBe(false);
	});
});

describe('the order of the stages', () => {
	const stages = [
		{ id: '30', position: 1 },
		{ id: '10', position: 0 },
		{ id: '20', position: 1 }
	];

	test('GIVEN stages THEN they run by position, then by ID', () => {
		expect(sortOnboardingStages(stages).map((stage) => stage.id)).toEqual(['10', '20', '30']);
	});

	test('GIVEN a stage moved up or down THEN every stage is in its new order', () => {
		expect(moveOnboardingStage(stages, '30', -1)).toEqual(['10', '30', '20']);
		expect(moveOnboardingStage(stages, '10', 1)).toEqual(['20', '10', '30']);
	});

	test('GIVEN the first stage moved up THEN it stays first', () => {
		expect(moveOnboardingStage(stages, '10', -1)).toEqual(['10', '20', '30']);
	});

	test('GIVEN a stage that is not there THEN there is no order', () => {
		expect(moveOnboardingStage(stages, '99', 1)).toBeNull();
	});
});
