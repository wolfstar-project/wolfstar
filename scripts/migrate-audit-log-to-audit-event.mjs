/**
 * Migrates legacy dashboard audit rows from audit_log into audit_event.
 *
 * Safe to run multiple times: skips when audit_log is absent or audit_event
 * already contains migrated legacy rows.
 *
 * Usage:
 *   node scripts/migrate-audit-log-to-audit-event.mjs
 *   DATABASE_URL=postgres://... node scripts/migrate-audit-log-to-audit-event.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

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

const ACTION_MAP = {
	'settings.update': 'guild.settings.update',
	'settings.add': 'guild.settings.add',
	'settings.remove': 'guild.settings.remove'
};

function mapAction(action) {
	return ACTION_MAP[action] ?? 'guild.settings.update';
}

function transformChanges(changes) {
	const before = {};
	const after = {};

	for (const change of changes ?? []) {
		if (!change || typeof change !== 'object') continue;
		const { key, oldValue, newValue } = change;
		if (typeof key !== 'string') continue;
		if (oldValue !== undefined) before[key] = oldValue;
		if (newValue !== undefined) after[key] = newValue;
	}

	return { before, after };
}

function toIsoTimestamp(value) {
	const date = value instanceof Date ? value : new Date(value);
	return date.toISOString();
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('[ERROR] DATABASE_URL is not set. Set it in src/.env or the environment.');
	process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const client = await pool.connect();

try {
	const auditLogExists = await client.query(`SELECT to_regclass('public.audit_log') IS NOT NULL AS exists`);
	if (!auditLogExists.rows[0]?.exists) {
		console.log('No legacy audit_log table found; nothing to migrate.');
		process.exit(0);
	}

	const auditEventExists = await client.query(`SELECT to_regclass('public.audit_event') IS NOT NULL AS exists`);
	if (!auditEventExists.rows[0]?.exists) {
		console.error('[ERROR] audit_event table does not exist. Run prisma migrate deploy first.');
		process.exit(1);
	}

	const existingCount = await client.query(`SELECT COUNT(*)::int AS count FROM audit_event`);
	if (existingCount.rows[0]?.count > 0) {
		console.log('audit_event already has rows; skipping legacy migration to avoid chain conflicts.');
		process.exit(0);
	}

	const { rows } = await client.query(
		`SELECT id, guild_id, user_id, action, changes, created_at
		 FROM audit_log
		 ORDER BY created_at ASC, id ASC`
	);

	if (rows.length === 0) {
		await client.query('DROP TABLE IF EXISTS "audit_log" CASCADE');
		console.log('Legacy audit_log was empty and has been dropped.');
		process.exit(0);
	}

	await client.query('BEGIN');
	await client.query('SELECT pg_advisory_xact_lock(1096107084)');

	let prevHash = null;

	for (const row of rows) {
		const changes = transformChanges(row.changes);
		const timestamp = row.created_at;
		const timestampIso = toIsoTimestamp(timestamp);
		const action = mapAction(row.action);

		const envelope = {
			action,
			actor: { type: 'user', id: row.user_id },
			outcome: 'success',
			tenantId: row.guild_id,
			timestamp: timestampIso,
			changes,
			reason: null,
			requestId: null,
			traceId: null,
			prevHash
		};

		const hash = hashEnvelope(envelope);

		await client.query(
			`INSERT INTO audit_event (
				action, actor_type, actor_id, outcome, tenant_id, reason,
				timestamp, changes, prev_hash, hash
			) VALUES ($1, 'user', $2, 'success', $3, NULL, $4, $5::json, $6, $7)`,
			[action, row.user_id, row.guild_id, timestamp, JSON.stringify(changes), prevHash, hash]
		);

		prevHash = hash;
	}

	await client.query(
		`INSERT INTO audit_chain_head (id, hash, updated_at)
		 VALUES ('default', $1, NOW())
		 ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, updated_at = EXCLUDED.updated_at`,
		[prevHash]
	);

	await client.query('DROP TABLE IF EXISTS "audit_log" CASCADE');
	await client.query('COMMIT');

	console.log(`Migrated ${rows.length} legacy audit_log row(s) into audit_event.`);
} catch (error) {
	await client.query('ROLLBACK');
	console.error(`[ERROR] Legacy audit migration failed: ${error.message}`);
	process.exit(1);
} finally {
	client.release();
	await pool.end();
}
