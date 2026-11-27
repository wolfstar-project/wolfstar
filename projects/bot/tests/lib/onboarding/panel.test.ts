import { decodeOnboardingPanelId, parseOnboardingToggleTarget } from '#lib/onboarding/ids';
import {
	createOnboardingStageInput,
	formatOnboardingTimeLimitMinutes,
	OnboardingStageInputs,
	OnboardingTimeLimitInputLength,
	parseOnboardingTimeLimitMinutes,
	renderOnboardingPanel,
	renderOnboardingStageModal,
	type OnboardingPanelContext
} from '#lib/onboarding/panel';
import type { Translator } from '#lib/structures/commands/utils';
import { ComponentType, type APIButtonComponentWithCustomId } from 'discord-api-types/v10';
import { OnboardingTimeLimitLimits, type OnboardingConfig } from 'wolfstar-database';

const Owner = '268792781713965056';
const t: Translator = (key) => key;

function config(enabled: boolean): OnboardingConfig {
	return { settings: { enabled, logChannelId: null, channelId: null, messageId: null, revision: 4 }, stages: [] };
}

function context(enabled: boolean): OnboardingPanelContext {
	return {
		t,
		ownerId: Owner,
		config: config(enabled),
		readiness: {
			community: false,
			nativeOnboardingEnabled: false,
			hasMessage: false,
			roles: new Map(),
			permissions: { manageRoles: true, kickMembers: true, moderateMembers: true },
			captchaAvailable: false
		},
		counts: { passed: 0, failed: 0, waiting: 0 }
	};
}

function findToggle(enabled: boolean) {
	const buttons = renderOnboardingPanel(context(enabled))
		.components!.filter((component) => component.type === ComponentType.ActionRow)
		.flatMap((row) => row.components) as APIButtonComponentWithCustomId[];
	// The content `StringIdParser` hands the handler: `<handler>.<sessionId>.<action>` without the handler.
	const toggle = buttons.map((button) => decodeOnboardingPanelId(button.custom_id.split('.').slice(1))).find((action) => action?.verb === 'toggle');
	return toggle!;
}

describe('the switch of the module', () => {
	test('GIVEN the module off THEN the button asks to turn it on, whatever it is when pressed', () => {
		expect(parseOnboardingToggleTarget(findToggle(false).extra)).toBe(true);
	});

	test('GIVEN the module on THEN the button asks to turn it off', () => {
		expect(parseOnboardingToggleTarget(findToggle(true).extra)).toBe(false);
	});

	test('GIVEN an ID with no target THEN it is refused', () => {
		expect(parseOnboardingToggleTarget('')).toBeNull();
		expect(parseOnboardingToggleTarget('maybe')).toBeNull();
	});
});

describe('the time limit in the modal', () => {
	test('GIVEN every time limit the dashboard can store THEN the modal shows it in its input, and reads it back the same', () => {
		const allowed = [0, ...Array.from({ length: OnboardingTimeLimitLimits.maximum - 59 }, (_, index) => index + 60)];
		const broken = allowed
			.map((seconds) => ({ seconds, text: formatOnboardingTimeLimitMinutes(seconds) }))
			.filter(({ seconds, text }) => text.length > OnboardingTimeLimitInputLength || parseOnboardingTimeLimitMinutes(text) !== seconds);
		expect(broken).toEqual([]);
	});

	test('GIVEN whole minutes THEN they show with no decimals', () => {
		expect(formatOnboardingTimeLimitMinutes(600)).toBe('10');
		expect(formatOnboardingTimeLimitMinutes(61)).toBe('1.02');
		expect(formatOnboardingTimeLimitMinutes(100)).toBe('1.67');
	});

	test('GIVEN a comma, spaces or something else THEN it is read as minutes, or as no number', () => {
		expect(parseOnboardingTimeLimitMinutes(' 1,5 ')).toBe(90);
		expect(Number.isNaN(parseOnboardingTimeLimitMinutes('soon'))).toBe(true);
	});

	test('GIVEN a stage of 61 seconds THEN its modal starts with a value its input accepts', () => {
		const modal = renderOnboardingStageModal({ t, ownerId: Owner, config: config(true) }, 'editSubmit', '1', 'Button', {
			name: 'Rules',
			question: null,
			answers: [],
			maxAttempts: 3,
			timeLimit: 61
		});
		const input = modal.components
			.map((component) => (component.type === ComponentType.Label ? component.component : null))
			.find((component) => component?.type === ComponentType.TextInput && component.custom_id === OnboardingStageInputs.timeLimit);
		expect(input).toMatchObject({ value: '1.02' });
		const { value, max_length } = input as { value: string; max_length: number };
		expect(value.length).toBeLessThanOrEqual(max_length);
	});
});

describe('createOnboardingStageInput', () => {
	const values = { name: ' Rules ', question: '', answers: [''], maxAttempts: 3, timeLimit: 600 };

	test('GIVEN a new stage with the question and the answers left blank THEN it is a Button stage', () => {
		expect(createOnboardingStageInput(values)).toMatchObject({ name: 'Rules', challenge: 'Button', question: null, answers: [] });
	});

	test('GIVEN a new stage with only spaces in the question THEN it is a Button stage too', () => {
		expect(createOnboardingStageInput({ ...values, question: '  ', answers: [' ', ''] })).toMatchObject({ challenge: 'Button' });
	});

	test('GIVEN a question or an answer THEN it is a Question stage', () => {
		expect(createOnboardingStageInput({ ...values, question: 'Who?', answers: ['me'] })).toMatchObject({
			challenge: 'Question',
			question: 'Who?',
			answers: ['me']
		});
		expect(createOnboardingStageInput({ ...values, answers: ['me'] })).toMatchObject({ challenge: 'Question' });
	});
});
