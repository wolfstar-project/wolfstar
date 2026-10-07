import { parseAutoModerationRulePatch } from '#lib/moderation/automod/validation';
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

		test('GIVEN some options THEN the others keep the value the rule has', () => {
			const { data } = parseAutoModerationRulePatch('Capitals', { options: { maximum: 80 } }, { minimum: 30, maximum: 50 });
			expect(data?.options).toEqual({ minimum: 30, maximum: 80 });
		});
	});
});
