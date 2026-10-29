import { andMix, asc, bidirectionalReplace, desc, differenceArray, differenceBitField, differenceMap, max, orMix } from '../src';

describe('util common comparators', () => {
	describe('andMix', () => {
		test('GIVEN two callbacks AND passing value THEN passes test', () => {
			const a = vi.fn((v: number) => v > 0);
			const b = vi.fn((v: number) => v < 1);

			const mix = andMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(0.5)).toBe(true);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(true);

			expect(b.mock.calls.length).toBe(1);
			expect(b.mock.results[0].value).toBe(true);
		});

		test('GIVEN two callbacks AND a value failing the second THEN fails test', () => {
			const a = vi.fn((v: number) => v > 0);
			const b = vi.fn((v: number) => v < 1);

			const mix = andMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(1.5)).toBe(false);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(true);

			expect(b.mock.calls.length).toBe(1);
			expect(b.mock.results[0].value).toBe(false);
		});

		test('GIVEN two callbacks AND a value failing the first THEN fails test and short-circuits the second', () => {
			const a = vi.fn((v: number) => v > 0);
			const b = vi.fn((v: number) => v < 1);

			const mix = andMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(-1)).toBe(false);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(false);

			expect(b.mock.calls.length).toBe(0);
		});
	});

	describe('orMix', () => {
		test('GIVEN two callbacks AND passing value THEN passes test', () => {
			const a = vi.fn((v: number) => v > 0);
			const b = vi.fn((v: number) => v < 1);

			const mix = orMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(0.5)).toBe(true);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(true);

			expect(b.mock.calls.length).toBe(0);
		});

		test('GIVEN two callbacks AND a value passing the first THEN passes test and short-circuits the second', () => {
			const a = vi.fn((v: number) => v > 0);
			const b = vi.fn((v: number) => v < 1);

			const mix = orMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(1.5)).toBe(true);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(true);

			expect(b.mock.calls.length).toBe(0);
		});

		test('GIVEN two callbacks AND a value passing the second THEN passes test', () => {
			const a = vi.fn((v: number) => v > 0);
			const b = vi.fn((v: number) => v < 1);

			const mix = orMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(-1)).toBe(true);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(false);

			expect(b.mock.calls.length).toBe(1);
			expect(b.mock.results[0].value).toBe(true);
		});

		test('GIVEN two callbacks AND a value failing both THEN fails test and short-circuits the second', () => {
			const a = vi.fn((v: number) => v < 0);
			const b = vi.fn((v: number) => v > 1);

			const mix = orMix(a, b);
			expect(a.mock.calls.length).toBe(0);
			expect(b.mock.calls.length).toBe(0);

			expect(mix(0.5)).toBe(false);
			expect(a.mock.calls.length).toBe(1);
			expect(a.mock.results[0].value).toBe(false);

			expect(b.mock.calls.length).toBe(1);
			expect(b.mock.results[0].value).toBe(false);
		});
	});
});

describe('util common ordering', () => {
	test('GIVEN asc and desc THEN sort in opposite orders', () => {
		expect([3, 1, 2].sort(asc)).toStrictEqual([1, 2, 3]);
		expect([3, 1, 2].sort(desc)).toStrictEqual([3, 2, 1]);
		expect(['b', 'a'].sort(asc)).toStrictEqual(['a', 'b']);
		expect(asc(2n, 2n)).toBe(0);
		expect(desc(2n, 2n)).toBe(0);
	});

	test('GIVEN max THEN returns the largest value', () => {
		expect(max(3, 9, 1)).toBe(9);
		expect(max(5n, 2n)).toBe(5n);
		expect(max(-4)).toBe(-4);
	});

	test('GIVEN max with no values THEN throws', () => {
		expect(() => max()).toThrow(TypeError);
	});
});

describe('util common differences', () => {
	test('GIVEN two bit fields THEN tells the bits added and removed', () => {
		expect(differenceBitField(0b0110, 0b1100)).toStrictEqual({ added: 0b1000, removed: 0b0010 });
		expect(differenceBitField(0b11n, 0b11n)).toStrictEqual({ added: 0n, removed: 0n });
	});

	test('GIVEN two arrays THEN tells the values added and removed', () => {
		expect(differenceArray(['a', 'b'], ['b', 'c'])).toStrictEqual({ added: ['c'], removed: ['a'] });
	});

	test('GIVEN two maps THEN tells the entries added, updated and removed', () => {
		const previous = new Map([
			['kept', 1],
			['changed', 2],
			['gone', 3]
		]);
		const next = new Map([
			['kept', 1],
			['changed', 20],
			['new', 4]
		]);

		expect(differenceMap(previous, next)).toStrictEqual({
			added: new Map([['new', 4]]),
			updated: new Map([['changed', [2, 20]]]),
			removed: new Map([['gone', 3]])
		});
	});
});

describe('util common bidirectionalReplace', () => {
	const options = {
		onMatch: (match: RegExpExecArray) => `<${match[1]}>`,
		outMatch: (content: string, previous: number, next: number) => `${content}@${previous}-${next}`
	};

	test('GIVEN text around matches THEN maps both the matches and what is between them', () => {
		expect(bidirectionalReplace(/\{(\w+)\}/g, 'hi {name}, bye {x}!', options)).toStrictEqual([
			'hi @0-3',
			'<name>',
			', bye @9-15',
			'<x>',
			'!@18-19'
		]);
	});

	test('GIVEN matches only THEN yields no text parts', () => {
		expect(bidirectionalReplace(/\{(\w+)\}/g, '{a}{b}', options)).toStrictEqual(['<a>', '<b>']);
	});

	test('GIVEN no match THEN yields the whole text', () => {
		expect(bidirectionalReplace(/\{(\w+)\}/g, 'plain', options)).toStrictEqual(['plain@0-5']);
	});
});
