import { resolveRuleListEntry, resolveSoftAction } from '#lib/moderation/automod/commands';
import { findAutoModerationRule } from '#lib/moderation/automod/rules';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { getDefaultAutoModerationRule, type AutoModerationRule, type AutoModerationRuleType } from 'wolfstar-database';

function createRule<Type extends AutoModerationRuleType>(type: Type, name: string, id = '1', options?: AutoModerationRule<Type>['options']) {
	const rule = { ...getDefaultAutoModerationRule(type), id, guildId: '254360814063058944', name };
	return (options ? { ...rule, options } : rule) as AutoModerationRule;
}

describe('auto-moderation commands', () => {
	describe('findAutoModerationRule', () => {
		const rules = [createRule('Links', 'No Links', '10'), createRule('Links', 'Promo', '11')];

		test('GIVEN a name THEN the case does not matter', () => {
			expect(findAutoModerationRule(rules, ' no links ')?.id).toBe('10');
		});

		test('GIVEN an ID THEN it finds the rule', () => {
			expect(findAutoModerationRule(rules, '11')?.name).toBe('Promo');
		});

		test('GIVEN neither THEN it finds nothing', () => {
			expect(findAutoModerationRule(rules, 'nope')).toBeNull();
		});
	});

	describe('resolveSoftAction', () => {
		const { flags } = AutoModerationOnInfraction;

		test('GIVEN some options THEN the others keep their bit', () => {
			expect(resolveSoftAction({ log: true }, flags.Delete)).toBe(flags.Delete | flags.Log);
			expect(resolveSoftAction({ delete: false }, flags.Delete | flags.Alert)).toBe(flags.Alert);
			expect(resolveSoftAction({}, flags.Alert)).toBe(flags.Alert);
		});
	});

	describe('resolveRuleListEntry', () => {
		test('GIVEN a words rule THEN the word is lowercased', () => {
			expect(resolveRuleListEntry(createRule('Words', 'Words'), ' BadWord ')).toMatchObject({ key: 'words', value: 'badword' });
		});

		test('GIVEN a links rule THEN a link stands for its hostname', () => {
			const rule = createRule('Links', 'Links', '1', { allowed: ['example.com'] });

			expect(resolveRuleListEntry(rule, 'https://Wolfstar.rocks/commands')).toEqual({
				key: 'allowed',
				list: ['example.com'],
				value: 'wolfstar.rocks'
			});
			expect(resolveRuleListEntry(rule, 'Example.com')?.value).toBe('example.com');
		});

		test('GIVEN an invites rule THEN an ID is a guild and anything else a code', () => {
			const rule = createRule('Invites', 'Invites');

			expect(resolveRuleListEntry(rule, '254360814063058944')).toMatchObject({ key: 'allowedGuilds', value: '254360814063058944' });
			expect(resolveRuleListEntry(rule, 'https://discord.gg/wolfstar')).toMatchObject({ key: 'allowedCodes', value: 'wolfstar' });
		});

		test('GIVEN a rule without a list THEN there is nothing to edit', () => {
			expect(resolveRuleListEntry(createRule('Capitals', 'Caps'), 'x')).toBeNull();
		});
	});
});
