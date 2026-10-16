import { getModerationReasonChoices, normalizeModerationReasonAlias, resolveModerationReasonAlias } from '#lib/moderation/reasons';

describe('predefined reasons', () => {
	const reasons = [
		{ alias: 'r3', reason: 'Rule 3: no advertising' },
		{ alias: 'spam', reason: 'Spamming in the channels' }
	];

	test('GIVEN an alias THEN it is matched whatever its case and spaces', () => {
		expect(normalizeModerationReasonAlias('  R3 ')).toBe('r3');
		expect(normalizeModerationReasonAlias('rule  three')).toBe('rule-three');
	});

	test('GIVEN the alias of a reason THEN the reason it stands for is written', () => {
		expect(resolveModerationReasonAlias(reasons, 'R3')).toBe('Rule 3: no advertising');
	});

	test('GIVEN a text that is no alias THEN it is written as it is', () => {
		expect(resolveModerationReasonAlias(reasons, 'Being rude')).toBe('Being rude');
	});

	test('GIVEN a query THEN the reasons whose alias or text has it are offered by alias', () => {
		expect(getModerationReasonChoices(reasons, 'advert')).toEqual([{ name: 'r3 — Rule 3: no advertising', value: 'r3' }]);
		expect(getModerationReasonChoices(reasons, '')).toHaveLength(2);
	});

	test('GIVEN a long reason THEN its choice fits the 100 characters of Discord', () => {
		const [choice] = getModerationReasonChoices([{ alias: 'long', reason: 'x'.repeat(300) }], '');

		expect(choice.name.length).toBeLessThanOrEqual(100);
		expect(choice.value).toBe('long');
	});
});
