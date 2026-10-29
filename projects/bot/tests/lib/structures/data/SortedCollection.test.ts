import { SortedCollection } from '#lib/structures/data/SortedCollection';
import { desc } from 'wolfstar-shared';

describe('SortedCollection', () => {
	test('GIVEN unsorted data THEN iterates it sorted by key', () => {
		const collection = new SortedCollection<number, string>([
			[3, 'c'],
			[1, 'a'],
			[2, 'b']
		]);

		expect([...collection]).toStrictEqual([
			[1, 'a'],
			[2, 'b'],
			[3, 'c']
		]);
		expect([...collection.keys()]).toStrictEqual([1, 2, 3]);
		expect([...collection.values()]).toStrictEqual(['a', 'b', 'c']);
		expect([...collection.entries()]).toStrictEqual([...collection]);
		expect(collection.size).toBe(3);
	});

	test('GIVEN a comparator THEN keeps that order', () => {
		const collection = new SortedCollection<number, string>(undefined, desc);
		collection.set(1, 'a').set(3, 'c').set(2, 'b');

		expect([...collection.keys()]).toStrictEqual([3, 2, 1]);
	});

	test('GIVEN set THEN inserts in order and replaces an existing key', () => {
		const collection = new SortedCollection<string, number>();
		collection.set('m', 1).set('a', 2).set('z', 3).set('m', 10);

		expect([...collection]).toStrictEqual([
			['a', 2],
			['m', 10],
			['z', 3]
		]);
	});

	test('GIVEN a key THEN finds it, and misses one it does not hold', () => {
		const collection = new SortedCollection<bigint, string>([
			[10n, 'ten'],
			[20n, 'twenty']
		]);

		expect(collection.get(20n)).toBe('twenty');
		expect(collection.has(10n)).toBe(true);
		expect(collection.indexOf(20n)).toBe(1);
		expect(collection.get(15n)).toBeUndefined();
		expect(collection.has(30n)).toBe(false);
		expect(collection.indexOf(5n)).toBe(-1);
	});

	test('GIVEN delete THEN removes the key and tells whether it was there', () => {
		const collection = new SortedCollection<number, string>([
			[1, 'a'],
			[2, 'b']
		]);

		expect(collection.delete(1)).toBe(true);
		expect(collection.delete(1)).toBe(false);
		expect([...collection.keys()]).toStrictEqual([2]);
	});

	test('GIVEN clear THEN empties it', () => {
		const collection = new SortedCollection<number, string>([[1, 'a']]);
		collection.clear();

		expect(collection.size).toBe(0);
		expect([...collection]).toStrictEqual([]);
	});

	test('GIVEN filter THEN returns a new collection with the matches, still sorted', () => {
		const collection = new SortedCollection<number, string>([
			[4, 'd'],
			[1, 'a'],
			[3, 'c'],
			[2, 'b']
		]);
		const even = collection.filter((_, key) => key % 2 === 0);

		expect([...even]).toStrictEqual([
			[2, 'b'],
			[4, 'd']
		]);
		expect(collection.size).toBe(4);

		even.set(3, 'c');
		expect([...even.keys()]).toStrictEqual([2, 3, 4]);
	});

	test('GIVEN filter with a thisArg THEN binds it', () => {
		const collection = new SortedCollection<number, string>([
			[1, 'a'],
			[2, 'b']
		]);
		const context = { wanted: 'b' };

		const result = collection.filter(function (this: typeof context, value) {
			return value === this.wanted;
		}, context);

		expect([...result]).toStrictEqual([[2, 'b']]);
	});

	test('GIVEN sweep THEN removes the matches and returns how many', () => {
		const collection = new SortedCollection<number, string>([
			[1, 'a'],
			[2, 'b'],
			[3, 'c'],
			[4, 'd']
		]);

		expect(collection.sweep((_, key) => key > 2)).toBe(2);
		expect([...collection.keys()]).toStrictEqual([1, 2]);
	});

	test('GIVEN a callback that is not a function THEN throws', () => {
		const collection = new SortedCollection<number, string>();

		expect(() => collection.filter(null as never)).toThrow(TypeError);
		expect(() => collection.sweep(null as never)).toThrow(TypeError);
		expect(() => collection.forEach(null as never)).toThrow(TypeError);
	});

	test('GIVEN getOrInsert THEN inserts only when the key is missing', () => {
		const collection = new SortedCollection<number, string>([[1, 'a']]);

		expect(collection.getOrInsert(1, 'x')).toBe('a');
		expect(collection.getOrInsert(2, 'b')).toBe('b');
		expect(collection.get(2)).toBe('b');
	});

	test('GIVEN getOrInsertComputed THEN computes only for a missing key', () => {
		const collection = new SortedCollection<number, string>([[1, 'a']]);
		const compute = vi.fn((key: number) => `computed ${key}`);

		expect(collection.getOrInsertComputed(1, compute)).toBe('a');
		expect(compute).not.toHaveBeenCalled();
		expect(collection.getOrInsertComputed(5, compute)).toBe('computed 5');
		expect(collection.get(5)).toBe('computed 5');
	});

	test('GIVEN forEach THEN visits the entries in order', () => {
		const collection = new SortedCollection<number, string>([
			[2, 'b'],
			[1, 'a']
		]);
		const visited: string[] = [];

		collection.forEach((value, key) => visited.push(`${key}${value}`));

		expect(visited).toStrictEqual(['1a', '2b']);
	});
});
