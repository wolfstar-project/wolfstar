import { getMaximumCombiningMarks, isZalgo } from '#utils/zalgo';

describe('zalgo', () => {
	describe('getMaximumCombiningMarks', () => {
		test('GIVEN plain text THEN returns 0', () => {
			expect(getMaximumCombiningMarks('')).toBe(0);
			expect(getMaximumCombiningMarks('Hello there, how are you?')).toBe(0);
			expect(getMaximumCombiningMarks('🐺 emojis are fine 🎉')).toBe(0);
		});

		test('GIVEN accented letters THEN counts the same whether they are precomposed or not', () => {
			expect(getMaximumCombiningMarks('perché')).toBe(1);
			expect(getMaximumCombiningMarks('perché')).toBe(1);
			// Vietnamese stacks a vowel mark and a tone.
			expect(getMaximumCombiningMarks('Việt Nam')).toBe(2);
		});

		test('GIVEN writing systems that stack marks by design THEN stays low', () => {
			expect(getMaximumCombiningMarks('ที่นี่')).toBeLessThanOrEqual(3);
			expect(getMaximumCombiningMarks('नमस्ते')).toBeLessThanOrEqual(3);
			expect(getMaximumCombiningMarks('مَرْحَبًا')).toBeLessThanOrEqual(3);
		});

		test('GIVEN zalgo text THEN returns the longest stack', () => {
			expect(getMaximumCombiningMarks('h̶̡͛̐̈̊éllo')).toBe(6);
			expect(getMaximumCombiningMarks('Z̷̢̛̤̞̓̈́a̶̡͑l̸̰̈́g̷͕̈́o̴͖͊')).toBeGreaterThan(4);
		});
	});

	describe('isZalgo', () => {
		test('GIVEN a text THEN compares its longest stack with the maximum', () => {
			const zalgo = 'h̶̡͛̐̈̊ello';

			expect(isZalgo(zalgo, 4)).toBe(true);
			expect(isZalgo(zalgo, 6)).toBe(false);
			expect(isZalgo('Việt Nam ที่นี่ perché', 4)).toBe(false);
		});
	});
});
