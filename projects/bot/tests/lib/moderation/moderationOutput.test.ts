import { getTypeColorOf } from '#lib/moderation/common/constants';
import { renderModerationOutput } from '#lib/moderation/structures/ModerationCommand';
import { Colors } from '#utils/constants';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`) as never;

function render(type: TypeVariation, metadata = TypeMetadata.None, reason: string | null = null) {
	const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason, type, metadata });
	return answer.embeds![0] as { color?: number; description?: string };
}

describe('moderation output', () => {
	test('GIVEN a warning THEN it is a small embed of the color of a warning, and not a line of text', () => {
		const answer = renderModerationOutput(t, { id: 12, tag: 'user#0', reason: null, type: TypeVariation.Warning, metadata: TypeMetadata.None });

		expect(answer.content).toBeUndefined();
		expect(answer.embeds).toHaveLength(1);
		expect(answer.allowed_mentions).toEqual({ parse: [] });
		expect(render(TypeVariation.Warning).color).toBe(Colors.Yellow);
	});

	test('GIVEN a mute and its undo THEN each has the color of its action', () => {
		expect(render(TypeVariation.Mute).color).toBe(Colors.Amber);
		expect(render(TypeVariation.Mute, TypeMetadata.Undo).color).toBe(Colors.LightBlue);
		expect(render(TypeVariation.Mute, TypeMetadata.Temporary).color).toBe(Colors.Amber300);
		expect(render(TypeVariation.Ban).color).toBe(getTypeColorOf(TypeVariation.Ban));
	});

	test('GIVEN a case THEN the embed has its number and the user, and the reason when there is one', () => {
		const without = render(TypeVariation.Warning);
		const withReason = render(TypeVariation.Warning, TypeMetadata.None, 'spam');

		expect(without.description).toContain('commands/moderation:moderationOutput ');
		expect(without.description).toContain('"range":12');
		expect(without.description).toContain('`user#0`');
		expect(withReason.description).toContain('commands/moderation:moderationOutputWithReason');
		expect(withReason.description).toContain('"reason":"spam"');
	});

	test('GIVEN a type that has no color THEN the embed is neutral', () => {
		expect(render(9999 as TypeVariation).color).toBe(Colors.BlueGrey);
	});
});
