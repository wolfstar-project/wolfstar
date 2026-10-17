import { getEncodedTwemoji, parseEmoji } from '#utils/functions/emojis';

describe('emojis', () => {
	describe('parseEmoji', () => {
		const id = '254360814063058944';

		test('GIVEN a mentioned custom emoji THEN it has its name, its ID and whether it is animated', () => {
			expect(parseEmoji(`<:wolf:${id}>`)).toEqual({ kind: 'custom', id, name: 'wolf', animated: false });
			expect(parseEmoji(`<a:wolf_dance:${id}>`)).toEqual({ kind: 'custom', id, name: 'wolf_dance', animated: true });
		});

		test('GIVEN a custom emoji without its angle brackets THEN it is read the same', () => {
			expect(parseEmoji(`:wolf:${id}`)).toEqual({ kind: 'custom', id, name: 'wolf', animated: false });
			expect(parseEmoji(`a:wolf:${id}`)).toEqual({ kind: 'custom', id, name: 'wolf', animated: true });
		});

		test('GIVEN an ID alone THEN it is a custom emoji of which only the ID is known', () => {
			expect(parseEmoji(` ${id} `)).toEqual({ kind: 'custom', id, name: null, animated: null });
		});

		test('GIVEN a unicode emoji THEN it is read, with or without its variation selector', () => {
			expect(parseEmoji('😃')).toEqual({ kind: 'unicode', emoji: '😃' });
			expect(parseEmoji('❤️')).toEqual({ kind: 'unicode', emoji: '❤️' });
			expect(getEncodedTwemoji('😃')).toBe('1f603');
		});

		test('GIVEN something that is not an emoji THEN it is null', () => {
			expect(parseEmoji('')).toBeNull();
			expect(parseEmoji('hello')).toBeNull();
			expect(parseEmoji('😃😃')).toBeNull();
			expect(parseEmoji('<:wolf:123>')).toBeNull();
			expect(parseEmoji(':wolf:')).toBeNull();
			expect(parseEmoji('%F0%9F%98%83')).toBeNull();
		});
	});
});
