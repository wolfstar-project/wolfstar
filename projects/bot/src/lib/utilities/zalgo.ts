/**
 * The combining marks: the accents and the other signs that are drawn on the character before them. Zalgo text is
 * made by stacking many of them on every letter.
 */
const CombiningMark = /\p{M}/u;

/**
 * Counts the most combining marks a single character of a text carries.
 *
 * @remarks
 *
 * The text is decomposed first (NFD), so that a letter written as one precomposed character (`é`) and the same letter
 * written as a base and its accent count the same. Writing systems that stack marks by design stay low: an accented
 * Latin letter carries one or two, a Thai or a Vietnamese syllable up to three.
 *
 * @param content - The text to measure.
 * @returns The length of the longest run of combining marks, `0` when the text has none.
 */
export function getMaximumCombiningMarks(content: string): number {
	let maximum = 0;
	let current = 0;
	for (const character of content.normalize('NFD')) {
		if (CombiningMark.test(character)) {
			if (++current > maximum) maximum = current;
		} else {
			current = 0;
		}
	}

	return maximum;
}

/**
 * Whether a text is zalgo text: one of its characters carries more combining marks than allowed.
 *
 * @param content - The text to check.
 * @param maximum - The most combining marks a character may carry.
 */
export function isZalgo(content: string, maximum: number): boolean {
	return getMaximumCombiningMarks(content) > maximum;
}
