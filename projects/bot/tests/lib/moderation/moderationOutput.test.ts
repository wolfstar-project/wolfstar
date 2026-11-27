import { renderModerationFailure, renderModerationOutput } from '#lib/moderation/structures/ModerationCommand';
import { Colors } from '#utils/constants';
import { Emojis } from '#utils/emojis';
import { TypeVariation } from '#utils/moderationConstants';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';

// Echoes the key and its options, and the sentence a sentence key is given, the translations are not what is tested:
const t = ((key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`) as never;
const userId = '266624760782258187';
const base = { id: 12, type: TypeVariation.Mute, undo: false, userId, duration: null, reason: null };

function text(answer: ReturnType<typeof renderModerationOutput>) {
	return answer.components[0].components
		.filter((c) => c.type === ComponentType.TextDisplay)
		.map((c) => c.content)
		.join('\n');
}

test('GIVEN a case THEN it says what was done to the mentioned user, with the emoji of its type, no bar and no ping', () => {
	const answer = renderModerationOutput(t, { ...base, reason: 'spam' });

	expect(text(answer)).toMatch(new RegExp(`^${Emojis.Mute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} commands/moderation:moderationOutputSentence`));
	expect(text(answer)).toContain(`commands/moderation:doneMute {\\"user\\":\\"<@${userId}>\\"}`);
	expect(text(answer)).toContain('"reason":"spam"');
	expect(text(answer)).toContain('commands/moderation:moderationOutputCase {"range":12}');
	expect(answer.components[0]).not.toHaveProperty('accent_color');
	expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
	expect(answer.allowed_mentions).toEqual({ parse: [] });
});

test('GIVEN a case with a duration THEN the sentence says how long', () => {
	const answer = renderModerationOutput(t, { ...base, duration: 60_000 });

	expect(text(answer)).toContain('commands/moderation:moderationOutputDuration');
	expect(text(answer)).toContain('globals:durationValue {\\"value\\":60000}');
});

test('GIVEN the undo of an action THEN it says so with the check', () => {
	const answer = renderModerationOutput(t, { ...base, undo: true });

	expect(text(answer)).toContain(`${Emojis.GreenTick} `);
	expect(text(answer)).toContain('commands/moderation:undoneMute');
});

test('GIVEN a direct message that was not delivered or a detail that was not kept THEN it is a yellow warning that says them', () => {
	const answer = renderModerationOutput(t, { ...base, undelivered: true, warnings: ['commands/case:proofTooLarge'] });

	expect(text(answer)).toContain('moderationOutputUndelivered');
	expect(text(answer)).toContain('commands/case:proofTooLarge');
	expect(text(answer)).toContain('"range":12');
	expect(answer.components[0].accent_color).toBe(Colors.Yellow);
});

test('GIVEN a custom response THEN it takes the place of the sentence, with the reason and the case under it', () => {
	const answer = renderModerationOutput(t, { ...base, reason: 'spam', response: 'Custom response' });
	const lines = text(answer).split('\n');

	expect(lines[0]).toContain('Custom response');
	expect(lines[1]).toContain('moderationOutputReason');
	expect(lines[2]).toContain('moderationOutputCase');
	expect(text(answer)).not.toContain('commands/moderation:done');
});

test('GIVEN a hidden reason and a delivered message THEN neither is told', () => {
	const answer = renderModerationOutput(t, { ...base, response: 'Custom response' });

	expect(text(answer)).not.toContain('moderationOutputReason');
	expect(text(answer)).not.toContain('moderationOutputUndelivered');
});

test('GIVEN a failure THEN it is red', () => {
	const answer = renderModerationFailure('I cannot moderate someone with an equal or higher role than me.');

	expect(text(answer)).toContain('equal or higher role');
	expect(answer.components[0].accent_color).toBe(Colors.Red);
});
