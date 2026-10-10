import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { getDefaultAutoModerationRule, type AutoModerationRule, type AutoModerationRuleType } from 'wolfstar-database';

function createRule<Type extends AutoModerationRuleType>(type: Type, id: string, options?: AutoModerationRule<Type>['options']) {
	const rule = { ...getDefaultAutoModerationRule(type), id, guildId: '254360814063058944', name: type };
	return (options ? { ...rule, options } : rule) as AutoModerationRule;
}

describe('addAutoModerationRuleHits', () => {
	test('GIVEN more hits than the maximum within the period THEN the member went over it', () => {
		const rule = createRule('MessageSpam', '9001', { maximum: 3, timePeriod: 60 });

		expect(addAutoModerationRuleHits(rule, 'member', 1)).toBe(false);
		expect(addAutoModerationRuleHits(rule, 'member', 2)).toBe(false);
		expect(addAutoModerationRuleHits(rule, 'other', 3)).toBe(false);
		expect(addAutoModerationRuleHits(rule, 'member', 1)).toBe(true);
	});

	test('GIVEN a member who went over the maximum THEN their count starts over', () => {
		const rule = createRule('LinksCooldown', '9002', { maximum: 1, timePeriod: 60 });

		expect(addAutoModerationRuleHits(rule, 'member', 2)).toBe(true);
		expect(addAutoModerationRuleHits(rule, 'member', 1)).toBe(false);
	});

	test('GIVEN nothing to count, or a rule that counts nothing THEN nobody goes over', () => {
		expect(addAutoModerationRuleHits(createRule('StickersCooldown', '9003', { maximum: 1, timePeriod: 60 }), 'member', 0)).toBe(false);
		expect(addAutoModerationRuleHits(createRule('Spoilers', '9004'), 'member', 50)).toBe(false);
	});
});
