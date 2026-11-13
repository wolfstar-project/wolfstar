import { editRuleListEntry, resolveRuleListEntry, resolveSoftAction } from '#lib/moderation/automod/commands';
import { findAutoModerationRule } from '#lib/moderation/automod/rules';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { getDefaultAutoModerationRule, type AutoModerationRule, type AutoModerationRuleType } from 'wolfstar-database';

function createRule<Type extends AutoModerationRuleType>(type: Type, name: string, id = '1', options?: AutoModerationRule<Type>['options']) {
	const rule = { ...getDefaultAutoModerationRule(type), id, guildId: '254360814063058944', name };
	return (options ? { ...rule, options } : rule) as AutoModerationRule;
}

// Echoes the key, the translations are not what is tested here:
const t = ((key: string) => key) as never;

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

		test('GIVEN a phishing rule THEN a hostname is stored the way the rule compares it, without its `www.`', () => {
			const rule = createRule('Phishing', 'Phishing', '1', { allowed: [] });

			expect(resolveRuleListEntry(rule, 'https://WWW.Example.com/login')?.value).toBe('example.com');
			expect(resolveRuleListEntry(rule, 'www.example.com')?.value).toBe('example.com');
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

	describe('editRuleListEntry', () => {
		const rule = createRule('Words', 'Words', '50', { words: ['bad'] });

		test('GIVEN a new word THEN it is added', () => {
			expect(editRuleListEntry(t, rule, 'Worse', 'add')).toEqual({
				content: 'commands/auto-moderation:addSuccess',
				key: 'words',
				list: ['bad', 'worse']
			});
		});

		test('GIVEN a word of one letter THEN it is refused', () => {
			expect(editRuleListEntry(t, rule, 'e', 'add')).toMatchObject({ content: 'commands/auto-moderation:errorWordLength', list: null });
		});

		test('GIVEN a word that is in the list, or that another word catches THEN it is not added', () => {
			expect(editRuleListEntry(t, rule, 'BAD', 'add')).toMatchObject({ content: 'commands/auto-moderation:addExists', list: null });
			expect(editRuleListEntry(t, rule, 'baaad', 'add')).toMatchObject({ content: 'commands/auto-moderation:addCovered', list: null });
		});

		test('GIVEN a word to remove THEN only one that is in the list is', () => {
			expect(editRuleListEntry(t, rule, 'bad', 'remove')).toMatchObject({ content: 'commands/auto-moderation:removeSuccess', list: [] });
			expect(editRuleListEntry(t, rule, 'good', 'remove')).toMatchObject({ content: 'commands/auto-moderation:removeMissing', list: null });
		});

		test('GIVEN a rule without a list THEN there is nothing to edit', () => {
			expect(editRuleListEntry(t, createRule('Zalgo', 'Zalgo'), 'x', 'add')).toMatchObject({
				content: 'commands/auto-moderation:errorNoList',
				list: null
			});
		});
	});
});
