import { auditDiff } from '#lib/api/auditDiff';

describe('auditDiff', () => {
	test('GIVEN equal objects THEN returns an empty patch', () => {
		expect(auditDiff({ prefix: '!', roles: ['1', '2'] }, { prefix: '!', roles: ['1', '2'] })).toEqual({ patch: [] });
	});

	test('GIVEN a key only in after THEN adds it', () => {
		expect(auditDiff({}, { prefix: '!' })).toEqual({ patch: [{ op: 'add', path: '/prefix', value: '!' }] });
	});

	test('GIVEN a key only in before THEN removes it', () => {
		expect(auditDiff({ prefix: '!' }, {})).toEqual({ patch: [{ op: 'remove', path: '/prefix' }] });
	});

	test('GIVEN a changed primitive THEN replaces it', () => {
		expect(auditDiff({ prefix: '!' }, { prefix: '?' })).toEqual({ patch: [{ op: 'replace', path: '/prefix', value: '?' }] });
	});

	test('GIVEN a changed array THEN replaces it as a whole', () => {
		expect(auditDiff({ roles: ['1'] }, { roles: ['1', '2'] })).toEqual({ patch: [{ op: 'replace', path: '/roles', value: ['1', '2'] }] });
	});

	test('GIVEN nested objects THEN diffs them key by key', () => {
		expect(auditDiff({ node: { a: 1, b: 2 } }, { node: { a: 1, b: 3, c: 4 } })).toEqual({
			patch: [
				{ op: 'replace', path: '/node/b', value: 3 },
				{ op: 'add', path: '/node/c', value: 4 }
			]
		});
	});

	test('GIVEN a value that becomes null THEN replaces it', () => {
		expect(auditDiff({ channel: '1' }, { channel: null })).toEqual({ patch: [{ op: 'replace', path: '/channel', value: null }] });
	});
});
