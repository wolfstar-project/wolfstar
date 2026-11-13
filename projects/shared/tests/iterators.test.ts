import { filter, iteratorRange, map, skip, take } from '../src';

function iterate<T>(values: readonly T[]) {
	return values[Symbol.iterator]() as IterableIterator<T>;
}

describe('iterators', () => {
	describe('iteratorRange', () => {
		test.each([
			{ position: 0, offset: 2, expected: [1, 2] },
			{ position: 1, offset: 2, expected: [2, 3] },
			{ position: 3, offset: 5, expected: [4, 5] },
			{ position: 5, offset: 1, expected: [] },
			{ position: 9, offset: 1, expected: [] },
			{ position: 1, offset: 0, expected: [] }
		])('GIVEN position $position and offset $offset THEN returns $expected', ({ position, offset, expected }) => {
			expect(iteratorRange(iterate([1, 2, 3, 4, 5]), position, offset)).toStrictEqual(expected);
		});
	});

	test('GIVEN map THEN yields every value through the callback', () => {
		expect([...map(iterate([1, 2, 3]), (value) => value * 10)]).toStrictEqual([10, 20, 30]);
	});

	test('GIVEN filter THEN yields only the values the callback accepts', () => {
		expect([...filter(iterate([1, 2, 3, 4]), (value) => value % 2 === 0)]).toStrictEqual([2, 4]);
	});

	describe('skip', () => {
		test.each([
			{ times: 0, expected: [1, 2, 3] },
			{ times: -1, expected: [1, 2, 3] },
			{ times: 2, expected: [3] },
			{ times: 5, expected: [] }
		])('GIVEN $times THEN leaves $expected', ({ times, expected }) => {
			expect([...skip(iterate([1, 2, 3]), times)]).toStrictEqual(expected);
		});
	});

	describe('take', () => {
		test.each([
			{ amount: 0, expected: [] },
			{ amount: 2, expected: [1, 2] },
			{ amount: 5, expected: [1, 2, 3] }
		])('GIVEN $amount THEN yields $expected', ({ amount, expected }) => {
			expect([...take(iterate([1, 2, 3]), amount)]).toStrictEqual(expected);
		});

		test('GIVEN an infinite iterator THEN stops after the amount', () => {
			function* naturals() {
				let i = 0;
				while (true) yield i++;
			}

			expect([...take(naturals(), 3)]).toStrictEqual([0, 1, 2]);
		});
	});
});
