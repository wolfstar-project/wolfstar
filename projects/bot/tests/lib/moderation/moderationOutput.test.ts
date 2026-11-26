import { renderModerationFailure, renderModerationOutput } from '#lib/moderation/structures/ModerationCommand';
import { Colors } from '#utils/constants';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';
const t = ((key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`) as never;
function text(answer: ReturnType<typeof renderModerationOutput>) {
	return answer.components[0].components
		.filter((c) => c.type === ComponentType.TextDisplay)
		.map((c) => c.content)
		.join('\n');
}
test('reports the created case and target in a green status without mentions', () => {
	const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason: 'spam' });
	expect(text(answer)).toContain('"range":12');
	expect(text(answer)).toContain('`user#0`');
	expect(text(answer)).toContain('"reason":"spam"');
	expect(answer.components[0].accent_color).toBe(Colors.Green);
	expect(answer.flags! & MessageFlags.IsComponentsV2).not.toBe(0);
	expect(answer.allowed_mentions).toEqual({ parse: [] });
});
test('reports an undelivered DM as a warning while preserving the created case', () => {
	const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null, undelivered: true });
	expect(text(answer)).toContain('moderationOutputUndelivered');
	expect(text(answer)).toContain('"range":12');
	expect(answer.components[0].accent_color).toBe(Colors.Yellow);
});
test('uses a custom response with the case and visible reason below it', () => {
	const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason: 'spam', response: 'Custom response' });
	const lines = text(answer).split('\n');
	expect(lines[0]).toContain('Custom response');
	expect(lines[1]).toContain('moderationOutputCase');
	expect(lines[2]).toContain('moderationOutputReason');
	expect(text(answer)).not.toContain('moderationOutputWithReason');
});
test('omits a hidden reason and a delivered DM notice', () => {
	const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null, response: 'Custom response' });
	expect(text(answer)).not.toContain('moderationOutputReason');
	expect(text(answer)).not.toContain('moderationOutputUndelivered');
});
test('reports a failure in red', () => {
	const answer = renderModerationFailure('Failed to moderate user');
	expect(text(answer)).toContain('Failed to moderate user');
	expect(answer.components[0].accent_color).toBe(Colors.Red);
});
