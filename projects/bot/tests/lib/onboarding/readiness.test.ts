import { decodeOnboardingPanelId, decodeOnboardingVerifyId, encodeOnboardingPanelId, encodeOnboardingVerifyId } from '#lib/onboarding/ids';
import { getChallengeChoices, getFailureChoices, parseFailureChoice } from '#lib/onboarding/panel';
import { getOnboardingStageBlockers, type OnboardingReadinessContext } from '#lib/onboarding/readiness';
import type { OnboardingStage } from 'wolfstar-database';

const stage: OnboardingStage = {
	id: '1',
	guildId: '254360814063058944',
	position: 0,
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
	failureTimeout: null,
	createdAt: 0
};

const ready: OnboardingReadinessContext = {
	community: true,
	nativeOnboardingEnabled: true,
	hasMessage: true,
	roles: new Map([
		['10', { managed: false, belowBot: true }],
		['11', { managed: true, belowBot: true }],
		['12', { managed: false, belowBot: false }]
	]),
	permissions: { manageRoles: true, kickMembers: true, moderateMembers: true },
	captchaAvailable: false
};

describe('getOnboardingStageBlockers', () => {
	test('GIVEN everything in place THEN the stage is ready', () => {
		expect(getOnboardingStageBlockers({ ...stage, roleId: '10', failureAction: 'Kick' }, ready)).toEqual([]);
	});

	test('GIVEN a NativeOnboarding stage in a server with no Community nor Discord onboarding THEN both are said', () => {
		const native = { ...stage, trigger: 'NativeOnboarding' } as const;
		expect(getOnboardingStageBlockers(native, { ...ready, community: false, nativeOnboardingEnabled: false })).toEqual([
			'NoCommunity',
			'NativeOnboardingOff'
		]);
		// A Join stage needs neither:
		expect(getOnboardingStageBlockers(stage, { ...ready, community: false, nativeOnboardingEnabled: false })).toEqual([]);
	});

	test('GIVEN no verification message THEN every stage is blocked', () => {
		expect(getOnboardingStageBlockers(stage, { ...ready, hasMessage: false })).toEqual(['NoMessage']);
	});

	test('GIVEN a role that is gone, managed or too high THEN it is said', () => {
		expect(getOnboardingStageBlockers({ ...stage, roleId: '99' }, ready)).toEqual(['RoleMissing']);
		expect(getOnboardingStageBlockers({ ...stage, roleId: '11' }, ready)).toEqual(['RoleManaged']);
		expect(getOnboardingStageBlockers({ ...stage, roleId: '12' }, ready)).toEqual(['RoleTooHigh']);
	});

	test('GIVEN a permission the stage needs missing THEN it is said', () => {
		const none = { ...ready, permissions: { manageRoles: false, kickMembers: false, moderateMembers: false } };
		expect(getOnboardingStageBlockers({ ...stage, roleId: '10' }, none)).toEqual(['MissingManageRoles']);
		expect(getOnboardingStageBlockers({ ...stage, failureAction: 'Kick' }, none)).toEqual(['MissingKickMembers']);
		expect(getOnboardingStageBlockers({ ...stage, failureAction: 'Timeout', failureTimeout: 600 }, none)).toEqual(['MissingModerateMembers']);
		expect(getOnboardingStageBlockers(stage, none)).toEqual([]);
	});

	test('GIVEN a captcha stage before the website serves it THEN it is blocked', () => {
		expect(getOnboardingStageBlockers({ ...stage, challenge: 'Captcha' }, ready)).toEqual(['CaptchaUnavailable']);
		expect(getOnboardingStageBlockers({ ...stage, challenge: 'Captcha' }, { ...ready, captchaAvailable: true })).toEqual([]);
	});
});

describe('the choices of the panel', () => {
	test('GIVEN the captcha unavailable THEN it is offered only to the stage that has it', () => {
		expect(getChallengeChoices({ challenge: 'Button' }, false)).toEqual(['Button', 'Emoji', 'Question']);
		expect(getChallengeChoices({ challenge: 'Captcha' }, false)).toContain('Captcha');
		expect(getChallengeChoices(null, true)).toContain('Captcha');
	});

	test('GIVEN a timeout the dashboard set THEN it is offered next to the usual ones, and read back', () => {
		const choices = getFailureChoices({ failureAction: 'Timeout', failureTimeout: 1800 });
		expect(choices.find((choice) => choice.current)?.value).toBe('Timeout:1800');
		expect(parseFailureChoice('Timeout:1800')).toEqual({ action: 'Timeout', timeout: 1800 });
		expect(parseFailureChoice('Kick')).toEqual({ action: 'Kick', timeout: null });
		expect(parseFailureChoice('Ban')).toBeNull();
	});
});

describe('the custom IDs', () => {
	test('GIVEN a component of the panel THEN it carries the revision it showed', () => {
		const action = { ownerId: '268792781713965056', verb: 'up', revision: 7, stageId: '42', extra: '' } as const;
		const [, ...content] = encodeOnboardingPanelId(action).split('.');
		expect(decodeOnboardingPanelId(content)).toEqual(action);
	});

	test('GIVEN a button of an emoji challenge THEN it carries the attempts and the index', () => {
		const action = { verb: 'emoji', verificationId: '99', attempts: 2, index: 4 } as const;
		const [, ...content] = encodeOnboardingVerifyId(action).split('.');
		expect(decodeOnboardingVerifyId(content)).toEqual(action);
	});
});
