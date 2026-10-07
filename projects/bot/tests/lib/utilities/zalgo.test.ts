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
			expect(getMaximumCombiningMarks('ที่นี่')).toBe(2);
			expect(getMaximumCombiningMarks('नमस्ते')).toBe(1);
			expect(getMaximumCombiningMarks('مَرْحَبًا')).toBe(1);
			expect(getMaximumCombiningMarks('ខ្ញុំ')).toBe(2);
			expect(getMaximumCombiningMarks('ကျွန်ုပ်')).toBe(2);
		});

		test('GIVEN the writing systems that stack the most THEN stays within the default maximum', () => {
			// Tibetan writes the consonants of a cluster under the first one, and they are combining marks:
			expect(getMaximumCombiningMarks('བསྒྲུབས')).toBe(3);
			expect(getMaximumCombiningMarks('ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ')).toBe(3);
			// Devanagari with a nukta, a vowel sign and a nasal sign:
			expect(getMaximumCombiningMarks('ज़िंदगी')).toBe(3);
			// Hebrew with its vowel points, and with a cantillation mark on top of them:
			expect(getMaximumCombiningMarks('בְּרֵאשִׁ֖ית')).toBe(3);
			expect(getMaximumCombiningMarks('שָּׁ֖')).toBe(4);
		});

		test('GIVEN zalgo text THEN returns the longest stack', () => {
			expect(getMaximumCombiningMarks('h̶̡͛̐̈̊éllo')).toBe(6);
			expect(getMaximumCombiningMarks('Z̷̢̛̤̞̓̈́a̶̡͑l̸̰̈́g̷͕̈́o̴͖͊')).toBe(8);
		});
	});

	describe('isZalgo', () => {
		test('GIVEN a text THEN compares its longest stack with the maximum', () => {
			const zalgo = 'h̶̡͛̐̈̊ello';

			expect(isZalgo(zalgo, 4)).toBe(true);
			expect(isZalgo(zalgo, 6)).toBe(false);
			expect(isZalgo('Việt Nam ที่นี่ perché', 4)).toBe(false);
			expect(isZalgo('བསྒྲུབས ज़िंदगी שָּׁ֖', 4)).toBe(false);
		});
	});
});
