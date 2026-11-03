import { formatAutoModerationResponse, parseAutoModerationResponse } from '#lib/moderation/automod/response';
import { MaximumAutoModerationRuleResponseLength } from 'wolfstar-database';

describe('the custom response of a rule', () => {
	const values = { user: '<@266624760782258186>', rule: 'No slurs', channel: '<#254360814063058944>' };

	test('GIVEN the placeholders THEN each is replaced, whatever its case', () => {
		expect(formatAutoModerationResponse('{user}, {Rule} does not allow that in {CHANNEL}.', values)).toBe(
			'<@266624760782258186>, No slurs does not allow that in <#254360814063058944>.'
		);
	});

	test('GIVEN a placeholder the response does not take THEN it is left as it was written', () => {
		expect(formatAutoModerationResponse('{user} {reason} **bold** <:wolf:1>', values)).toBe('<@266624760782258186> {reason} **bold** <:wolf:1>');
	});

	test('GIVEN what was written THEN it is trimmed, and nothing or none is no response', () => {
		expect(parseAutoModerationResponse('  {user}, no.  ')).toBe('{user}, no.');
		expect(parseAutoModerationResponse('')).toBeNull();
		expect(parseAutoModerationResponse('  ')).toBeNull();
		expect(parseAutoModerationResponse('None')).toBeNull();
	});

	test('GIVEN a response longer than it can be THEN it is refused', () => {
		expect(parseAutoModerationResponse('x'.repeat(MaximumAutoModerationRuleResponseLength))).toHaveLength(
			MaximumAutoModerationRuleResponseLength
		);
		expect(parseAutoModerationResponse('x'.repeat(MaximumAutoModerationRuleResponseLength + 1))).toBeUndefined();
	});
});
