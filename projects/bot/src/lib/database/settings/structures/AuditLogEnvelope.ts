import { createHash } from 'node:crypto';

export interface AuditEnvelopeInput {
	action: string;
	actor: { type: 'user'; id: string };
	outcome: 'success' | 'failure' | 'denied';
	tenantId: string;
	timestamp: string;
	changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
	reason: string | null;
	requestId: string | null;
	traceId: string | null;
	prevHash: string | null;
}

/**
 * Deterministic JSON stringification with sorted keys.
 * Matches evlog's internal stableStringify pattern.
 * bigint is serialised as a decimal string for JSON round-trip safety.
 */
export function canonicalize(value: unknown): string {
	if (typeof value === 'bigint') return JSON.stringify(value.toString());
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${(value as unknown[]).map(canonicalize).join(',')}]`;
	const keys = Object.keys(value as Record<string, unknown>).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function hashEnvelope(envelope: AuditEnvelopeInput): string {
	return createHash('sha256').update(canonicalize(envelope)).digest('hex');
}
