import { createLogMessage, MaximumLogMessageLength } from '#utils/functions/logs';
import { REST } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';

const author = { id: '266624760782258186', username: 'wolf', discriminator: '0', global_name: null, avatar: null };

function collectText(components: readonly unknown[]): string[] {
	const texts: string[] = [];
	for (const component of components as readonly { type: ComponentType; content?: string; components?: unknown[] }[]) {
		if (component.type === ComponentType.TextDisplay && component.content !== undefined) texts.push(component.content);
		texts.push(...collectText(component.components ?? []));
	}
	return texts;
}

describe('createLogMessage', () => {
	// The avatar of the author is a CDN URL:
	beforeAll(() => {
		container.rest = new REST();
	});

	test('GIVEN a short log THEN it is a components v2 message with the author, the content and the footer', () => {
		const message = createLogMessage({ color: 0xff0000, author, content: 'hello', footer: 'footer' });
		const texts = collectText(message.components);

		expect(message.flags).toBe(MessageFlags.IsComponentsV2);
		expect(message.allowed_mentions).toEqual({ parse: [] });
		expect(texts[0]).toContain('wolf');
		expect(texts[1]).toBe('hello');
		expect(texts.at(-1)).toContain('footer');
	});

	test('GIVEN a long log THEN it is split in blocks and the text stays within the limit of Discord', () => {
		const message = createLogMessage({ color: 0, author, content: 'word '.repeat(3000), footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.length).toBeGreaterThan(3);
		expect(texts.every((text) => text.length <= 1024 + 100)).toBe(true);
		expect(texts.join('').length).toBeLessThanOrEqual(MaximumLogMessageLength + 50);
	});

	test('GIVEN the blocks themselves THEN each is a component of its own that is never cut', () => {
		const quote = `\`\`\`\n${'a'.repeat(1500)}\n\`\`\``;
		const message = createLogMessage({ color: 0, author, content: ['head', '', quote], footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1)).toEqual(['head', quote]);
	});

	test('GIVEN blocks that do not fit THEN the first that does not is left out whole, with the ones after it', () => {
		const message = createLogMessage({ color: 0, author, content: ['a'.repeat(3000), 'b'.repeat(3000), 'c'], footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1)).toEqual(['a'.repeat(3000)]);
	});
});
