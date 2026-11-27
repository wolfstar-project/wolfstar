import {
	decideOnboardingAnswer,
	getOnboardingFailureReason,
	getOnboardingEmojiChallenge,
	getOnboardingStep,
	isOnboardingExpired,
	OnboardingEmojiOptions,
	selectCurrentStay
} from '#lib/onboarding/flow';
import type { OnboardingStage, OnboardingVerification } from 'wolfstar-database';

const Guild = '254360814063058944';
const User = '268792781713965056';

function stage(id: string, position: number, overrides: Partial<OnboardingStage> = {}): OnboardingStage {
	return {
		id,
		guildId: Guild,
		position,
		name: `Stage ${id}`,
		enabled: true,
		trigger: 'Join',
		challenge: 'Button',
		question: null,
		answers: [],
		maxAttempts: 3,
		timeLimit: 600,
		roleId: null,
		failureAction: 'None',
		failureTimeout: null,
		createdAt: 0,
		...overrides
	};
}

let nextRow = 1;
function row(stageId: string, status: OnboardingVerification['status'], createdAt = 1000): OnboardingVerification {
	return {
		id: String(nextRow++),
		guildId: Guild,
		userId: User,
		stageId,
		stageName: `Stage ${stageId}`,
		status,
		attempts: 0,
		createdAt,
		resolvedAt: null
	};
}

describe('getOnboardingStep', () => {
	test('GIVEN no enabled stage THEN the member is done', () => {
		expect(getOnboardingStep([stage('1', 0, { enabled: false })], [], false)).toEqual({ kind: 'Done' });
	});

	test('GIVEN stages out of order THEN the first by position starts, whatever its ID', () => {
		const step = getOnboardingStep([stage('2', 1), stage('9', 0)], [], false);
		expect(step).toMatchObject({ kind: 'Start', stage: { id: '9' } });
	});

	test('GIVEN a disabled stage first THEN it is skipped', () => {
		const step = getOnboardingStep([stage('1', 0, { enabled: false }), stage('2', 1)], [], false);
		expect(step).toMatchObject({ kind: 'Start', stage: { id: '2' } });
	});

	test('GIVEN the first stage passed THEN the next one starts, and none before it is passed', () => {
		const stages = [stage('1', 0), stage('2', 1)];
		expect(getOnboardingStep(stages, [row('1', 'Passed')], false)).toMatchObject({ kind: 'Start', stage: { id: '2' } });
		expect(getOnboardingStep(stages, [row('2', 'Passed')], false)).toMatchObject({ kind: 'Start', stage: { id: '1' } });
	});

	test('GIVEN every stage passed THEN the member is done', () => {
		expect(getOnboardingStep([stage('1', 0), stage('2', 1)], [row('1', 'Passed'), row('2', 'Passed')], false)).toEqual({ kind: 'Done' });
	});

	test('GIVEN a member in a stage THEN they wait on it', () => {
		const waiting = row('1', 'Waiting');
		expect(getOnboardingStep([stage('1', 0)], [waiting], false)).toEqual({ kind: 'Waiting', stage: stage('1', 0), verification: waiting });
	});

	test('GIVEN a NativeOnboarding stage THEN it starts only once the member completed Discord onboarding', () => {
		const stages = [stage('1', 0, { trigger: 'NativeOnboarding' })];
		expect(getOnboardingStep(stages, [], false)).toMatchObject({ kind: 'AwaitNativeOnboarding', stage: { id: '1' } });
		expect(getOnboardingStep(stages, [], true)).toMatchObject({ kind: 'Start', stage: { id: '1' } });
	});

	test('GIVEN a Join stage after a NativeOnboarding one THEN it waits for the native one first', () => {
		const stages = [stage('1', 0, { trigger: 'NativeOnboarding' }), stage('2', 1)];
		expect(getOnboardingStep(stages, [], false)).toMatchObject({ kind: 'AwaitNativeOnboarding', stage: { id: '1' } });
		expect(getOnboardingStep(stages, [row('1', 'Passed')], false)).toMatchObject({ kind: 'Start', stage: { id: '2' } });
	});

	test('GIVEN a failed stage THEN the member may start it again, but not one that kicks', () => {
		expect(getOnboardingStep([stage('1', 0)], [row('1', 'Failed')], false)).toMatchObject({ kind: 'Failed', retry: true });
		expect(getOnboardingStep([stage('1', 0, { failureAction: 'Kick' })], [row('1', 'Failed')], false)).toMatchObject({
			kind: 'Failed',
			retry: false
		});
	});

	test('GIVEN a failed stage started again THEN the latest row decides', () => {
		const waiting = row('1', 'Waiting');
		expect(getOnboardingStep([stage('1', 0)], [row('1', 'Failed'), waiting], false)).toMatchObject({ kind: 'Waiting', verification: waiting });
	});

	test('GIVEN a row of a deleted stage THEN it is ignored', () => {
		expect(getOnboardingStep([stage('2', 0)], [{ ...row('1', 'Waiting'), stageId: null }], false)).toMatchObject({
			kind: 'Start',
			stage: { id: '2' }
		});
	});
});

describe('a member who leaves or joins again', () => {
	test('GIVEN a member who left mid-stage THEN the row reads as left and the stage starts again', () => {
		expect(getOnboardingStep([stage('1', 0)], [row('1', 'Left')], false)).toMatchObject({ kind: 'Start', stage: { id: '1' } });
	});

	test('GIVEN a member who joins again THEN what they passed before does not count', () => {
		const before = [row('1', 'Passed', 1000), row('2', 'Waiting', 2000)];
		const stay = selectCurrentStay(before, 60_000);
		expect(stay).toEqual([]);
		expect(getOnboardingStep([stage('1', 0), stage('2', 1)], stay, false)).toMatchObject({ kind: 'Start', stage: { id: '1' } });
	});

	test('GIVEN rows of this stay THEN they are kept, a row written just before the join included', () => {
		const rows = [row('1', 'Passed', 1000), row('1', 'Passed', 59_000), row('2', 'Waiting', 61_000)];
		expect(selectCurrentStay(rows, 60_000).map((entry) => entry.createdAt)).toEqual([59_000, 61_000]);
	});

	test('GIVEN no join time THEN every row is kept', () => {
		expect(selectCurrentStay([row('1', 'Passed', 1)], null)).toHaveLength(1);
	});
});

describe('decideOnboardingAnswer', () => {
	test('GIVEN a right answer THEN the member passes', () => {
		expect(decideOnboardingAnswer({ maxAttempts: 3 }, { attempts: 2 }, true)).toEqual({ kind: 'Pass' });
	});

	test('GIVEN wrong answers THEN the attempts count down, and the last one fails', () => {
		expect(decideOnboardingAnswer({ maxAttempts: 3 }, { attempts: 0 }, false)).toEqual({ kind: 'Wrong', attemptsLeft: 2 });
		expect(decideOnboardingAnswer({ maxAttempts: 3 }, { attempts: 1 }, false)).toEqual({ kind: 'Wrong', attemptsLeft: 1 });
		expect(decideOnboardingAnswer({ maxAttempts: 3 }, { attempts: 2 }, false)).toEqual({ kind: 'Fail' });
		expect(decideOnboardingAnswer({ maxAttempts: 1 }, { attempts: 0 }, false)).toEqual({ kind: 'Fail' });
	});
});

describe('isOnboardingExpired', () => {
	test('GIVEN a time limit THEN it runs out once its seconds passed', () => {
		expect(isOnboardingExpired({ timeLimit: 60 }, { createdAt: 0 }, 59_999)).toBe(false);
		expect(isOnboardingExpired({ timeLimit: 60 }, { createdAt: 0 }, 60_000)).toBe(true);
	});

	test('GIVEN no time limit THEN it never runs out', () => {
		expect(isOnboardingExpired({ timeLimit: 0 }, { createdAt: 0 }, Number.MAX_SAFE_INTEGER)).toBe(false);
	});
});

describe('getOnboardingEmojiChallenge', () => {
	test('GIVEN the same row and attempt THEN the challenge is the same, so any process checks the click', () => {
		expect(getOnboardingEmojiChallenge('42', 0)).toEqual(getOnboardingEmojiChallenge('42', 0));
	});

	test('GIVEN a challenge THEN it shows distinct emojis and asks for one of them', () => {
		const { target, options } = getOnboardingEmojiChallenge('42', 1);
		expect(options).toHaveLength(OnboardingEmojiOptions);
		expect(new Set(options.map((option) => option.emoji)).size).toBe(OnboardingEmojiOptions);
		expect(target).toBeGreaterThanOrEqual(0);
		expect(target).toBeLessThan(OnboardingEmojiOptions);
	});
});

describe('getOnboardingFailureReason', () => {
	test('GIVEN a member with attempts left and time left THEN nothing fails them', () => {
		expect(getOnboardingFailureReason({ maxAttempts: 3, timeLimit: 60 }, { attempts: 2, createdAt: 0 }, 59_999)).toBeNull();
	});

	test('GIVEN a member whose time ran out THEN they fail by the time limit', () => {
		expect(getOnboardingFailureReason({ maxAttempts: 3, timeLimit: 60 }, { attempts: 0, createdAt: 0 }, 60_000)).toBe('TimeLimit');
	});

	test('GIVEN a member who used every attempt, whose failure action did not go through THEN they still fail by the attempts', () => {
		expect(getOnboardingFailureReason({ maxAttempts: 3, timeLimit: 0 }, { attempts: 3, createdAt: 0 }, 0)).toBe('Attempts');
	});
});
