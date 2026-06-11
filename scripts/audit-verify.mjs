/**
 * Standalone audit chain integrity verifier.
 *
 * Reads all audit_event rows from Postgres, re-derives each row's SHA-256
 * envelope hash, validates the prevHash chain, and exits 1 if any violation
 * is found.
 *
 * Usage:  node scripts/audit-verify.mjs
 *         DATABASE_URL=postgres://... node scripts/audit-verify.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// .env loader — mirrors prisma.config.ts (reads src/.env)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../src/.env');

try {
	const raw = readFileSync(envPath, 'utf8');
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const val = trimmed
			.slice(eqIdx + 1)
			.trim()
			.replace(/^["']|["']$/g, '');
		if (key && !(key in process.env)) process.env[key] = val;
	}
} catch {
	// .env not present — rely on environment variables already set
}

// ---------------------------------------------------------------------------
// Envelope helpers (inlined from AuditLogEnvelope.ts — must stay in sync)
// ---------------------------------------------------------------------------

function canonicalize(value) {
	if (typeof value === 'bigint') return JSON.stringify(value.toString());
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
	const keys = Object.keys(value).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

function hashEnvelope(envelope) {
	return createHash('sha256').update(canonicalize(envelope)).digest('hex');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('[ERROR] DATABASE_URL is not set. Set it in src/.env or the environment.');
	process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

let client;
try {
	client = await pool.connect();
} catch (err) {
	console.error(`[ERROR] Could not connect to database: ${err.message}`);
	await pool.end();
	process.exit(1);
}

let violations = 0;

try {
	const { rows } = await client.query(
		`SELECT id, action, actor_type, actor_id, outcome, tenant_id,
		        timestamp, changes, reason, prev_hash, hash
		 FROM audit_event`
	);

	console.log(`Verifying ${rows.length} audit event(s)...`);

	if (rows.length > 0) {
		// Index rows by prevHash for O(1) chain traversal
		const byPrevHash = new Map(); // prevHash -> row
		let root = null;

		for (const row of rows) {
			if (row.prev_hash === null) {
				if (root) {
					console.error(`[CHAIN FORK] Multiple root events (prevHash=null): ${root.id} and ${row.id}`);
					violations++;
				} else {
					root = row;
				}
			} else {
				if (byPrevHash.has(row.prev_hash)) {
					console.error(`[CHAIN FORK] Multiple events claim prevHash=${row.prev_hash}`);
					violations++;
				}
				byPrevHash.set(row.prev_hash, row);
			}
		}

		if (!root) {
			console.error(`[ERROR] No root event found (prevHash=null) but rows exist`);
			console.error(`[ORPHAN] ${rows.length} row(s) unreachable (no chain root)`);
			violations += 1 + rows.length;
		} else {
			let current = root;
			const visited = new Set();

			while (current) {
				if (visited.has(current.id)) {
					console.error(`[CYCLE] Cycle detected at id=${current.id}`);
					violations++;
					break;
				}
				visited.add(current.id);

				const envelope = {
					action: current.action,
					actor: { type: current.actor_type, id: current.actor_id },
					outcome: current.outcome,
					tenantId: current.tenant_id,
					timestamp: current.timestamp.toISOString(),
					changes: current.changes,
					reason: current.reason,
					requestId: null,
					traceId: null,
					prevHash: current.prev_hash
				};

				const computedHash = hashEnvelope(envelope);
				if (computedHash !== current.hash) {
					console.error(`[HASH MISMATCH] id=${current.id} stored=${current.hash} computed=${computedHash}`);
					violations++;
				}

				current = byPrevHash.get(current.hash) ?? null;
			}

			const orphans = rows.length - visited.size;
			if (orphans > 0) {
				console.error(`[ORPHAN] ${orphans} row(s) not reachable from the chain root`);
				violations += orphans;
			}
		}
	}
} finally {
	client.release();
	await pool.end();
}

console.log(`\nAudit chain verification: ${violations} integrity violation(s) found`);
if (violations > 0) process.exit(1);
