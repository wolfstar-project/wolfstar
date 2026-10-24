import { checkAutoModerationRuleOptions, parseAutoModerationRulePatch } from '#lib/moderation/automod/validation';
import { getDefaultAutoModerationRuleOptions, normalizeAutoModerationRuleOptions } from 'wolfstar-database';

describe('auto-moderation rules', () => {
	describe('options', () => {
		test('GIVEN nothing THEN each type takes its defaults', () => {
			expect(normalizeAutoModerationRuleOptions('Capitals', null)).toEqual(getDefaultAutoModerationRuleOptions('Capitals'));
			expect(normalizeAutoModerationRuleOptions('Attachments', { anything: 1 })).toEqual({});
		});

		test('GIVEN numbers out of range THEN they are brought within the limits', () => {
			expect(normalizeAutoModerationRuleOptions('Capitals', { minimum: 1, maximum: 500 })).toEqual({ minimum: 5, maximum: 100 });
			expect(normalizeAutoModerationRuleOptions('Zalgo', { maximum: 2.9 })).toEqual({ maximum: 2 });
			expect(normalizeAutoModerationRuleOptions('Newlines', { maximum: 'many' })).toEqual({ maximum: 20 });
		});

		test('GIVEN lists THEN they lose their duplicates and what is not text', () => {
			expect(normalizeAutoModerationRuleOptions('Words', { words: ['one', 'two', 'one', 1, ''] })).toEqual({ words: ['one', 'two'] });
			expect(normalizeAutoModerationRuleOptions('Invites', { allowedCodes: 'nope' })).toEqual({ allowedCodes: [], allowedGuilds: [] });
		});

		test('GIVEN words THEN they are lowercased, and the ones of one letter or too long are dropped', () => {
			expect(normalizeAutoModerationRuleOptions('Words', { words: [' BadWord ', 'e', 'x'.repeat(33)] })).toEqual({ words: ['badword'] });
		});

		test('GIVEN hostnames THEN they are lowercased, and the invite codes are not', () => {
			expect(normalizeAutoModerationRuleOptions('Links', { allowed: ['Example.COM'] })).toEqual({ allowed: ['example.com'] });
			expect(normalizeAutoModerationRuleOptions('Invites', { allowedCodes: ['WolfStar'] }).allowedCodes).toEqual(['WolfStar']);
		});

		test('GIVEN a list longer than the cap THEN it is kept, since a migrated rule may have it', () => {
			const words = Array.from({ length: 250 }, (_, index) => `word${index}`);
			expect(normalizeAutoModerationRuleOptions('Words', { words }).words).toHaveLength(250);
		});

		test('GIVEN options of another type THEN they are dropped', () => {
			expect(normalizeAutoModerationRuleOptions('Links', { allowed: ['example.com'], words: ['a'] })).toEqual({ allowed: ['example.com'] });
		});
	});

	describe('patch', () => {
		test('GIVEN a body that is not an object THEN it is refused', () => {
			expect(parseAutoModerationRulePatch('Links', null).errors).toEqual(['Invalid body.']);
			expect(parseAutoModerationRulePatch('Links', 'text').errors).toEqual(['Invalid body.']);
		});

		test('GIVEN only some fields THEN only they are in the patch', () => {
			expect(parseAutoModerationRulePatch('Links', { enabled: false, softAction: 5 }).data).toEqual({ enabled: false, softAction: 5 });
			expect(parseAutoModerationRulePatch('Links', {}).data).toEqual({});
		});

		test('GIVEN fields the rules do not have THEN they are left out', () => {
			expect(parseAutoModerationRulePatch('Links', { id: '1', guildId: '2', type: 'Words' }).data).toEqual({});
		});

		test('GIVEN a duration of zero THEN the hard action is permanent', () => {
			expect(parseAutoModerationRulePatch('Links', { hardActionDuration: 0 }).data).toEqual({ hardActionDuration: null });
			expect(parseAutoModerationRulePatch('Links', { hardActionDuration: null }).data).toEqual({ hardActionDuration: null });
			expect(parseAutoModerationRulePatch('Links', { hardActionDuration: 60_000 }).data).toEqual({ hardActionDuration: 60_000 });
		});

		test('GIVEN invalid fields THEN each is reported', () => {
			const { errors } = parseAutoModerationRulePatch('Links', {
				name: '',
				enabled: 'yes',
				softAction: 8,
				hardAction: 'Explode',
				hardActionDuration: 2 ** 31,
				thresholdMaximum: 101,
				thresholdDuration: -1,
				ignoredRoles: ['abc'],
				ignoredChannels: 'none',
				options: []
			});

			expect(errors?.map((error) => error.split(':')[0])).toEqual([
				'name',
				'enabled',
				'softAction',
				'hardAction',
				'hardActionDuration',
				'thresholdMaximum',
				'thresholdDuration',
				'ignoredRoles',
				'ignoredChannels',
				'options'
			]);
		});

		test('GIVEN IDs THEN the duplicates are dropped', () => {
			const id = '254360814063058944';
			expect(parseAutoModerationRulePatch('Links', { ignoredRoles: [id, id] }).data).toEqual({ ignoredRoles: [id] });
		});

		test('GIVEN words with look-alike characters THEN they are stored as the messages are matched', () => {
			const { data } = parseAutoModerationRulePatch('Words', { options: { words: ['ＢａｄＷｏｒｄ', 'e'] } });
			expect(data?.options).toEqual({ words: ['badword'] });
		});

		test('GIVEN a list over the cap THEN it cannot grow, but the rule that has it can be edited', () => {
			const words = Array.from({ length: 250 }, (_, index) => `word${index}`);

			expect(parseAutoModerationRulePatch('Words', { options: { words } }).errors).toEqual(['options.words: Expected at most 200 entries.']);
			expect(parseAutoModerationRulePatch('Words', { options: { words } }, { options: { words } }).errors).toBeUndefined();
			expect(parseAutoModerationRulePatch('Words', { options: { words: [...words, 'more'] } }, { options: { words } }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Words', { options: { words: words.slice(1) } }, { options: { words } }).errors).toBeUndefined();
		});

		test('GIVEN some options THEN the others keep the value the rule has', () => {
			const { data } = parseAutoModerationRulePatch('Capitals', { options: { maximum: 80 } }, { options: { minimum: 30, maximum: 50 } });
			expect(data?.options).toEqual({ minimum: 30, maximum: 80 });
		});

		describe('a Timeout', () => {
			// Discord does not take a timeout with no end, so a rule like that would never act:
			const message = 'hardActionDuration: Expected an integer between 1 and 2147483647, which a Timeout requires.';

			test.each([
				['a new rule that is a Timeout with no duration', { hardAction: 'Timeout' }, undefined],
				['a new rule that is a Timeout with a duration of zero', { hardAction: 'Timeout', hardActionDuration: 0 }, undefined],
				['a rule that becomes a Timeout and has no duration', { hardAction: 'Timeout' }, { hardAction: 'Ban', hardActionDuration: null }],
				['a Timeout that loses its duration', { hardActionDuration: null }, { hardAction: 'Timeout', hardActionDuration: 60_000 } as const],
				['a Timeout whose duration is set to zero', { hardActionDuration: 0 }, { hardAction: 'Timeout', hardActionDuration: 60_000 } as const]
			] as const)('GIVEN %s THEN it is refused with one error about the duration', (_name, input, current) => {
				const { data, errors } = parseAutoModerationRulePatch('Links', input, current);

				expect(data).toBeUndefined();
				expect(errors).toEqual([message]);
			});

			test('GIVEN a Timeout with a duration THEN it is accepted, given in the request or kept by the rule', () => {
				expect(parseAutoModerationRulePatch('Links', { hardAction: 'Timeout', hardActionDuration: 60_000 }).data).toEqual({
					hardAction: 'Timeout',
					hardActionDuration: 60_000
				});
				expect(
					parseAutoModerationRulePatch('Links', { hardAction: 'Timeout' }, { hardAction: 'Ban', hardActionDuration: 60_000 }).data
				).toEqual({
					hardAction: 'Timeout'
				});
				expect(
					parseAutoModerationRulePatch('Links', { hardActionDuration: 30_000 }, { hardAction: 'Timeout', hardActionDuration: 60_000 }).data
				).toEqual({
					hardActionDuration: 30_000
				});
			});

			test('GIVEN a rule that is a Timeout with no duration WHEN it is edited in another way THEN it can be, as it can be saved', () => {
				const current = { hardAction: 'Timeout', hardActionDuration: null } as const;

				expect(parseAutoModerationRulePatch('Links', { enabled: false }, current).data).toEqual({ enabled: false });
				expect(parseAutoModerationRulePatch('Links', { name: 'Renamed', softAction: 2 }, current).data).toEqual({
					name: 'Renamed',
					softAction: 2
				});
			});

			// The dashboard sends the whole rule back when one field changes:
			test('GIVEN a rule that is a Timeout with no duration WHEN the request gives back the same action and duration THEN it is accepted', () => {
				const current = { hardAction: 'Timeout', hardActionDuration: null } as const;

				expect(
					parseAutoModerationRulePatch('Links', { hardAction: 'Timeout', hardActionDuration: null, enabled: false }, current).data
				).toEqual({
					hardAction: 'Timeout',
					hardActionDuration: null,
					enabled: false
				});
				expect(parseAutoModerationRulePatch('Links', { hardAction: 'Timeout', hardActionDuration: 0 }, current).errors).toBeUndefined();
			});

			test('GIVEN a hard action that is not valid THEN it only has its own error', () => {
				expect(parseAutoModerationRulePatch('Links', { hardAction: 'Explode' }).errors).toEqual([
					expect.stringMatching(/^hardAction: Expected one of /)
				]);
				expect(parseAutoModerationRulePatch('Links', { hardAction: 'Timeout', hardActionDuration: -5 }).errors).toEqual([
					expect.stringMatching(/^hardActionDuration: Expected null or an integer/)
				]);
			});

			test('GIVEN a hard action that is not a Timeout THEN it needs no duration', () => {
				expect(parseAutoModerationRulePatch('Links', { hardAction: 'Ban' }).data).toEqual({ hardAction: 'Ban' });
				expect(
					parseAutoModerationRulePatch('Links', { hardActionDuration: null }, { hardAction: 'Kick', hardActionDuration: 60_000 }).data
				).toEqual({
					hardActionDuration: null
				});
			});
		});
	});

	describe('checkAutoModerationRuleOptions', () => {
		test('GIVEN options as they are stored THEN nothing is wrong', () => {
			expect(checkAutoModerationRuleOptions('Words', { words: ['spam', ' SCAM ', 'spam'] })).toEqual([]);
			expect(checkAutoModerationRuleOptions('NoMentionSpam', { alerts: true, mentionsAllowed: 20, timePeriod: 8 })).toEqual([]);
			expect(checkAutoModerationRuleOptions('Capitals', { minimum: 5 })).toEqual([]);
			expect(checkAutoModerationRuleOptions('Attachments', {})).toEqual([]);
		});

		test('GIVEN a value of the wrong type THEN it is reported by its option', () => {
			expect(checkAutoModerationRuleOptions('Words', { words: 'spam' })).toEqual(['options.words: Expected an array of strings.']);
			expect(checkAutoModerationRuleOptions('NoMentionSpam', { alerts: 1 })).toEqual(['options.alerts: Expected a boolean.']);
			expect(checkAutoModerationRuleOptions('Zalgo', { maximum: '4' })).toEqual(['options.maximum: Expected an integer between 1 and 20.']);
		});

		test('GIVEN a number that is out of its limits or not whole THEN it is reported', () => {
			expect(checkAutoModerationRuleOptions('Zalgo', { maximum: 21 })).toHaveLength(1);
			expect(checkAutoModerationRuleOptions('Zalgo', { maximum: 2.5 })).toHaveLength(1);
			expect(checkAutoModerationRuleOptions('Zalgo', { maximum: Number.NaN })).toHaveLength(1);
		});

		test('GIVEN entries that are not valid THEN each is reported by its index', () => {
			expect(checkAutoModerationRuleOptions('Words', { words: ['spam', 'x', 1] })).toEqual([
				'options.words[1]: Expected a word of 2 to 32 characters.',
				'options.words[2]: Expected a string that is not empty.'
			]);
			expect(checkAutoModerationRuleOptions('Invites', { allowedCodes: [''] })).toEqual([
				'options.allowedCodes[0]: Expected a string that is not empty.'
			]);
		});

		test('GIVEN an option the type does not have THEN it is reported', () => {
			expect(checkAutoModerationRuleOptions('Attachments', { maximum: 1 })).toEqual([
				'options.maximum: Not an option of a rule of type Attachments.'
			]);
		});
	});
});
