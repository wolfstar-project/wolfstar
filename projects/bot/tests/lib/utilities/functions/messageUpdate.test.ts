import { getMessageDifference, getMessageSeparate, getMessageUpdateContent } from '#utils/functions/messageUpdate';

// Echoes the key, the translations are not what is tested here:
const t = (key: string) => key;

describe('getMessageDifference', () => {
	test('GIVEN an edit THEN the removed words are struck through and the added ones are bold', () => {
		expect(getMessageDifference('hello world', 'hello there')).toBe('hello ~~world~~**there**');
	});

	test('GIVEN a message that was empty THEN the new content is bold', () => {
		expect(getMessageDifference('', 'new')).toBe('**new**');
	});

	test('GIVEN a message that became empty THEN the old content is struck through', () => {
		expect(getMessageDifference('old', '')).toBe('~~old~~');
	});

	test('GIVEN two empty contents THEN it is empty', () => {
		expect(getMessageDifference('', '')).toBe('');
	});
});

describe('getMessageSeparate', () => {
	test('GIVEN an edit THEN the content before and after are two parts with their titles', () => {
		expect(getMessageSeparate(t, 'old text', 'new text')).toEqual([
			'**events/messages:messageUpdateBefore**\nold text',
			'**events/messages:messageUpdateAfter**\nnew text'
		]);
	});

	test('GIVEN Markdown THEN it is escaped, so that it is shown as it was written', () => {
		const [before, after] = getMessageSeparate(t, '**bold** and ~~gone~~', '__under__');

		expect(before).toContain('\\*\\*bold\\*\\*');
		expect(before).toContain('\\~\\~gone\\~\\~');
		expect(after).toContain('\\_\\_under\\_\\_');
	});

	test('GIVEN an empty content THEN a placeholder is shown in its place', () => {
		const [before, after] = getMessageSeparate(t, '', 'new');

		expect(before).toBe('**events/messages:messageUpdateBefore**\nevents/messages:messageUpdateEmpty');
		expect(after).toBe('**events/messages:messageUpdateAfter**\nnew');
	});
});

describe('getMessageUpdateContent', () => {
	test('GIVEN the Difference style THEN it is one text', () => {
		expect(getMessageUpdateContent('Difference', t, 'a b', 'a c')).toBe('a ~~b~~**c**');
	});

	test('GIVEN the Separate style THEN it is the two parts', () => {
		const content = getMessageUpdateContent('Separate', t, 'a b', 'a c');

		expect(Array.isArray(content)).toBe(true);
		expect(content).toHaveLength(2);
	});
});
