import { canonicalize, hashEnvelope, type AuditEnvelopeInput } from '#lib/database/settings/structures/AuditLogEnvelope';

const baseEnvelope: AuditEnvelopeInput = {
	action: 'guild.settings.update',
	actor: { type: 'user', id: '123456789012345678' },
	outcome: 'success',
	tenantId: '987654321098765432',
	timestamp: '2026-05-09T12:00:00.000Z',
	changes: { before: { foo: 'a' }, after: { foo: 'b' } },
	reason: null,
	requestId: null,
	traceId: null,
	prevHash: null,
	sequence: 1n
};

describe('canonicalize()', () => {
	it('produces identical output regardless of key insertion order', () => {
		const a = canonicalize({ z: 1, a: 2, m: 3 });
		const b = canonicalize({ a: 2, m: 3, z: 1 });
		expect(a).toBe(b);
	});

	it('serialises bigint as a decimal string', () => {
		expect(canonicalize(42n)).toBe('"42"');
		expect(canonicalize({ seq: 999n })).toBe('{"seq":"999"}');
	});

	it('handles null', () => {
		expect(canonicalize(null)).toBe('null');
	});

	it('handles arrays', () => {
		expect(canonicalize([1, 2, 3])).toBe('[1,2,3]');
	});
});

describe('hashEnvelope()', () => {
	it('is deterministic for identical inputs', () => {
		const h1 = hashEnvelope(baseEnvelope);
		const h2 = hashEnvelope({ ...baseEnvelope });
		expect(h1).toBe(h2);
	});

	it('produces a 64-character hex string', () => {
		expect(hashEnvelope(baseEnvelope)).toHaveLength(64);
		expect(hashEnvelope(baseEnvelope)).toMatch(/^[0-9a-f]{64}$/);
	});

	it('produces different hashes when any field changes', () => {
		const h1 = hashEnvelope(baseEnvelope);
		const h2 = hashEnvelope({ ...baseEnvelope, action: 'guild.settings.add' });
		const h3 = hashEnvelope({ ...baseEnvelope, sequence: 2n });
		const h4 = hashEnvelope({ ...baseEnvelope, prevHash: 'abc123' });
		expect(h1).not.toBe(h2);
		expect(h1).not.toBe(h3);
		expect(h1).not.toBe(h4);
	});
});
