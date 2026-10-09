import { createLogMessage, fitLogParts, MaximumLogMessageLength } from '#utils/functions/logs';
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

	test('GIVEN several parts THEN each starts a block of its own, in order', () => {
		const message = createLogMessage({ color: 0, author, content: ['before', 'after'], footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.slice(1, -1)).toEqual(['before', 'after']);
	});

	test('GIVEN parts that do not fit together THEN the text stays within the limit of Discord', () => {
		const message = createLogMessage({ color: 0, author, content: ['a '.repeat(3000), 'b '.repeat(3000)], footer: 'footer' });
		const texts = collectText(message.components);

		expect(texts.join('').length).toBeLessThanOrEqual(MaximumLogMessageLength + 50);
		expect(texts.some((text) => text.startsWith('a'))).toBe(true);
		expect(texts.some((text) => text.startsWith('b'))).toBe(true);
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
});
