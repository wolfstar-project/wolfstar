import {
	decodeAppealId,
	encodeAppealId,
	findAppealableCases,
	getAppealUrl,
	isAppealable,
	parseAppealCase,
	type AppealableCase
} from '#lib/moderation/appeals';
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

	test.each([
		['42', 42],
		['#42', 42],
		[' 42 ', 42],
		['2147483647', 2147483647]
	])('GIVEN the option %j THEN it is the case %i', (value, expected) => {
		expect(parseAppealCase(value)).toBe(expected);
	});

	// A number past an `int4` would make the database refuse the query instead of finding nothing:
	test.each(['', '0', '-1', '1.5', 'nope', '##1', '2147483648', '99999999999'])('GIVEN the option %j THEN it cannot be a case', (value) => {
		expect(parseAppealCase(value)).toBeNull();
	});

	test('GIVEN a guild THEN its appeal page is on the website', () => {
		expect(getAppealUrl('254360814063058944')).toBe('https://wolfstar.rocks/appeal/254360814063058944');
	});
});
