import { renderModerationFailure, renderModerationOutput } from '#lib/moderation/structures/ModerationCommand';
import { Colors } from '#utils/constants';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`) as never;

function embed(answer: ReturnType<typeof renderModerationOutput>) {
	return answer.embeds![0] as { color?: number; description?: string };
}

describe('moderation output', () => {
	test('GIVEN a case THEN it is a small green embed, and not a line of text', () => {
		const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null });

		expect(answer.content).toBeUndefined();
		expect(answer.embeds).toHaveLength(1);
		expect(answer.allowed_mentions).toEqual({ parse: [] });
		expect(embed(answer).color).toBe(Colors.Green);
	});

	test('GIVEN a case THEN the embed has its number and the user, and the reason when there is one', () => {
		const without = embed(renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null }));
		const withReason = embed(renderModerationOutput(t, { id: 12, tag: 'user#0', reason: 'spam' }));

		expect(without.description).toContain('commands/moderation:moderationOutput ');
		expect(without.description).toContain('"range":12');
		expect(without.description).toContain('`user#0`');
		expect(withReason.description).toContain('commands/moderation:moderationOutputWithReason');
		expect(withReason.description).toContain('"reason":"spam"');
	});

	test('GIVEN a case whose user could not be sent the direct message THEN it is yellow and says so', () => {
		const answer = embed(renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null, undelivered: true }));

		expect(answer.color).toBe(Colors.Yellow);
		expect(answer.description).toContain('commands/moderation:moderationOutputUndelivered');
		expect(answer.description).toContain('"range":12');
	});

	test('GIVEN a case whose user was told THEN it does not mention the direct message', () => {
		const answer = embed(renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null, undelivered: false }));

		expect(answer.description).not.toContain('Undelivered');
	});

	test('GIVEN a failure THEN it is a small red embed with the reason', () => {
		const answer = renderModerationFailure('Failed to moderate user');

		expect(answer.content).toBeUndefined();
		expect(embed(answer)).toMatchObject({ color: Colors.Red, description: 'Failed to moderate user' });
	});
});
