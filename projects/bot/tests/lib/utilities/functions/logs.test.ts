import { createEventLogMessage, createLogMessage, fitLogParts, MaximumLogMessageLength } from '#utils/functions/logs';
import { REST } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { ButtonStyle, ComponentType, MessageFlags } from 'discord-api-types/v10';

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
		expect(texts.join('').length).toBeLessThanOrEqual(MaximumLogMessageLength);
	});

	test('GIVEN a long text with no space nor line break THEN it is cut in blocks and every character survives', () => {
		const content = 'x'.repeat(1500);
		const message = createLogMessage({ color: 0, author, content, footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1).join('')).toBe(content);
	});

	test('GIVEN several parts THEN each starts a block of its own, in order', () => {
		const message = createLogMessage({ color: 0, author, content: ['before', 'after'], footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1)).toEqual(['before', 'after']);
	});

	test('GIVEN parts that do not fit together THEN the text stays within the limit of Discord', () => {
		const message = createLogMessage({ color: 0, author, content: ['a '.repeat(3000), 'b '.repeat(3000)], footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.join('').length).toBeLessThanOrEqual(MaximumLogMessageLength);
		expect(texts.some((text) => text.startsWith('a'))).toBe(true);
		expect(texts.some((text) => text.startsWith('b'))).toBe(true);
	});
});

describe('createEventLogMessage', () => {
	const options = { color: 0xffbf00, title: 'Message Edited', details: 'From: <@1>   In: <#2>', footer: 'Author: 1 | Message ID: 3' };

	test('GIVEN a log THEN it has the title, who and where, the content and the footer, in that order', () => {
		const message = createEventLogMessage({ ...options, content: ['**Before**\nold', '**After**\nnew'] });
		const texts = collectText(message.components);

		expect(message.flags).toBe(MessageFlags.IsComponentsV2);
		expect(message.allowed_mentions).toEqual({ parse: [] });
		expect(texts.slice(0, 2)).toEqual(['### Message Edited', 'From: <@1>   In: <#2>']);
		expect(texts.slice(2, -1)).toEqual(['**Before**\nold', '**After**\nnew']);
		expect(texts.at(-1)).toContain('Author: 1 | Message ID: 3');
	});

	test('GIVEN buttons THEN they are a row under the container, and five at most', () => {
		const buttons = Array.from({ length: 7 }, (_, index) => ({
			type: ComponentType.Button as const,
			style: ButtonStyle.Secondary as const,
			custom_id: `button.${index}`,
			label: `Button ${index}`
		}));
		const message = createEventLogMessage({ ...options, content: 'text', buttons });

		expect(message.components.map((component) => component.type)).toEqual([ComponentType.Container, ComponentType.ActionRow]);
		expect((message.components[1] as { components: unknown[] }).components).toHaveLength(5);
	});

	test('GIVEN no buttons THEN there is only the container', () => {
		const message = createEventLogMessage({ ...options, content: 'text' });

		expect(message.components.map((component) => component.type)).toEqual([ComponentType.Container]);
	});

	test('GIVEN images THEN they are a gallery after the text, 10 at most', () => {
		const images = Array.from({ length: 12 }, (_, index) => `https://cdn.discordapp.com/attachments/1/2/${index}.png`);
		const message = createEventLogMessage({ ...options, content: 'text', images });
		const { components } = message.components[0] as { components: { type: ComponentType; items?: unknown[] }[] };
		const gallery = components.find((component) => component.type === ComponentType.MediaGallery);

		expect(gallery?.items).toHaveLength(10);
		expect(components.findIndex((component) => component === gallery)).toBeGreaterThan(
			components.findIndex(
				(component) => component.type === ComponentType.TextDisplay && (component as { content?: string }).content === 'text'
			)
		);
	});

	test('GIVEN a long log THEN the text stays within the limit of Discord', () => {
		const message = createEventLogMessage({ ...options, content: 'word '.repeat(3000) });

		expect(collectText(message.components).join('').length).toBeLessThanOrEqual(MaximumLogMessageLength);
	});
});

describe('fitLogParts', () => {
	test('GIVEN parts that fit THEN they are kept whole', () => {
		expect(fitLogParts(['abc', 'de'], 5)).toEqual(['abc', 'de']);
		expect(fitLogParts([], 10)).toEqual([]);
	});

	test('GIVEN parts of the same length that do not fit THEN they get an even share', () => {
		expect(fitLogParts(['a'.repeat(10), 'b'.repeat(10)], 10)).toEqual(['a'.repeat(5), 'b'.repeat(5)]);
	});

	test('GIVEN a short part and a long one THEN the short one is kept and the long one gets the rest', () => {
		const [short, long] = fitLogParts(['a'.repeat(100), 'b'.repeat(5000)], 3000);

		expect(short).toHaveLength(100);
		expect(long).toHaveLength(2900);
	});

	test('GIVEN the long part first THEN the order is kept', () => {
		const [long, short] = fitLogParts(['b'.repeat(5000), 'a'.repeat(100)], 3000);

		expect(long).toHaveLength(2900);
		expect(short).toHaveLength(100);
	});

	test('GIVEN no room THEN every part is empty', () => {
		expect(fitLogParts(['abc', 'def'], 0)).toEqual(['', '']);
		expect(fitLogParts(['abc', 'def'], -5)).toEqual(['', '']);
	});

	test('GIVEN the blocks themselves THEN each is a component of its own that is never cut', () => {
		const quote = `\`\`\`\n${'a'.repeat(1500)}\n\`\`\``;
		const message = createLogMessage({ color: 0, author, content: { blocks: ['head', '', quote] }, footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1)).toEqual(['head', quote]);
	});

	test('GIVEN blocks that do not fit THEN the first that does not is left out whole, with the ones after it', () => {
		const message = createLogMessage({ color: 0, author, content: { blocks: ['a'.repeat(3000), 'b'.repeat(3000), 'c'] }, footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1)).toEqual(['a'.repeat(3000)]);
	});
});
