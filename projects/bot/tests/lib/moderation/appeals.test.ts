import { decodeAppealId, encodeAppealId, findAppealableCases, getAppealUrl, isAppealable, type AppealableCase } from '#lib/moderation/appeals';
import { getAppealQuestions, parseAppealAnswers } from '#lib/moderation/appealService';
import { TypeVariation } from '#utils/moderationConstants';

describe('appeals', () => {
	const settings = { appealsEnabled: true, appealsBans: true, appealsMutes: false, appealsTimeouts: true };
	const entry = (id: number, type: TypeVariation, state: 'open' | 'undo' | 'completed' | 'archived' = 'open', userId = 'u'): AppealableCase => ({
		id,
		type,
		userId,
		isUndo: () => state === 'undo',
		isCompleted: () => state === 'completed',
		isArchived: () => state === 'archived'
	});

	test('GIVEN the settings THEN only the enabled types can be appealed, and nothing when appeals are off', () => {
		expect(isAppealable(settings, TypeVariation.Ban)).toBe(true);
		expect(isAppealable(settings, TypeVariation.Mute)).toBe(false);
		expect(isAppealable(settings, TypeVariation.Warning)).toBe(false);
		expect(isAppealable({ ...settings, appealsEnabled: false }, TypeVariation.Ban)).toBe(false);
	});

	test('GIVEN the cases of a member THEN the latest one in course of each type is appealable', () => {
		const cases = [
			entry(1, TypeVariation.Ban, 'completed'),
			entry(2, TypeVariation.Ban),
			entry(3, TypeVariation.Timeout, 'undo'),
			entry(4, TypeVariation.Mute)
		];

		expect(findAppealableCases(cases, 'u', settings).map((item) => item.id)).toEqual([2]);
	});

	test('GIVEN a case of another member THEN it is not theirs to appeal', () => {
		expect(findAppealableCases([entry(1, TypeVariation.Ban, 'open', 'other')], 'u', settings)).toEqual([]);
	});

	test('GIVEN an action THEN its custom ID is read back', () => {
		const id = encodeAppealId({ appealId: '12', verb: 'deny', submit: true });

		expect(id.startsWith('appeal.')).toBe(true);
		expect(decodeAppealId(id.split('.').slice(1))).toEqual({ appealId: '12', verb: 'deny', submit: true });
		expect(decodeAppealId(['12', 'explode:0'])).toBeNull();
		expect(decodeAppealId(['x', 'accept:0'])).toBeNull();
	});

	test('GIVEN the answers of a form THEN there is one per question, written and not too long', () => {
		expect(parseAppealAnswers([' I am sorry '], 1)).toEqual(['I am sorry']);
		expect(parseAppealAnswers(['a'], 2)).toBeNull();
		expect(parseAppealAnswers([''], 1)).toBeNull();
		expect(parseAppealAnswers(['x'.repeat(1001)], 1)).toBeNull();
		expect(parseAppealAnswers('nope', 1)).toBeNull();
	});

	test('GIVEN a guild with no questions THEN the form asks the default one', () => {
		const t = ((key: string) => key) as never;

		expect(getAppealQuestions(t, [])).toEqual(['moderation:appealDefaultQuestion']);
		expect(getAppealQuestions(t, ['One', ' ', 'Two', 'Three', 'Four', 'Five', 'Six'])).toHaveLength(5);
	});

	test('GIVEN a guild THEN its appeal page is on the website', () => {
		expect(getAppealUrl('254360814063058944')).toBe('https://wolfstar.rocks/appeal/254360814063058944');
	});
});
