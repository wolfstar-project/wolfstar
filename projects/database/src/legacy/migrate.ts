import { convertLegacyCase, type LegacyCaseEncoder } from './cases.js';
import { convertLegacyGuild } from './guild.js';
import { convertLegacyAuditEvent, convertLegacyCommandLog, convertLegacyUser } from './logs.js';
import { findLegacyTables, readLegacyRows, type LegacyClient } from './source.js';
import type { LegacyRow } from './types.js';
import { insertMissing } from './write.js';

export type { LegacyCaseEncoder } from './cases.js';
export type { LegacyClient } from './source.js';

/**
 * Where the conversion tells what it did.
 */
export interface LegacyMigrationLog {
	info(message: string): void;
	warn(message: string): void;
	error(message: string, error?: unknown): void;
}

export interface LegacyMigrationOptions {
	client: LegacyClient;
	encodeCase: LegacyCaseEncoder;
	log: LegacyMigrationLog;
}

export interface LegacyMigrationReport {
	guilds: { converted: number; skipped: number; failed: number };
	cases: { converted: number; skipped: number };
	auditEvents: number;
	commandLogs: number;
	users: number;
}

/** The tables of a guild, parents first. */
const GuildTables = [
	'Guild',
	'Modules',
	'GuildCommands',
	'GuildLogs',
	'GuildModeration',
	'GuildPermissions',
	'GuildRoles',
	'StickyRole',
	'GuildAutoModerationRule'
] as const;

async function inTransaction(client: LegacyClient, run: () => Promise<void>) {
	await client.query('BEGIN');
	try {
		await run();
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK').catch(() => null);
		throw error;
	}
}

/**
 * Converts one guild. The lock keeps a second process that starts at the same time from doing it too, and whether it was
 * done is asked again under it.
 *
 * @returns Whether it was converted here.
 */
async function convertGuild(
	{ client, encodeCase, log }: LegacyMigrationOptions,
	row: LegacyRow,
	cases: readonly LegacyRow[],
	report: LegacyMigrationReport
) {
	const guildId = row.id as string;
	let converted = false;
	let casesConverted = 0;
	let casesSkipped = 0;
	const warnings: string[] = [];

	await inTransaction(client, async () => {
		await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('legacy:' || $1, 0))`, [guildId]);
		const done = await client.query(`SELECT 1 FROM "LegacyMigratedGuild" WHERE guild_id = $1`, [guildId]);
		if (done.rows.length > 0) return;

		const rows = convertLegacyGuild(row);
		warnings.push(...rows.warnings);
		for (const table of GuildTables) await insertMissing(client, table, rows[table]);

		const convertedCases = cases.map((entry) => convertLegacyCase(entry, encodeCase));
		const valid = convertedCases.filter((entry) => entry !== null);
		casesConverted = await insertMissing(
			client,
			'ModerationAction',
			valid.map((entry) => entry.case)
		);
		casesSkipped = cases.length - casesConverted;
		await insertMissing(
			client,
			'ModerationCaseData',
			valid.flatMap((entry) => (entry.data === null ? [] : [entry.data]))
		);
		warnings.push(...valid.flatMap((entry) => entry.warnings));

		await client.query(`INSERT INTO "LegacyMigratedGuild" (guild_id) VALUES ($1)`, [guildId]);
		converted = true;
	});

	for (const warning of warnings) log.warn(`[LEGACY] ${guildId}: ${warning}`);
	if (casesSkipped > 0) log.warn(`[LEGACY] ${guildId}: ${casesSkipped} of ${cases.length} cases were left out.`);
	report.cases.converted += casesConverted;
	report.cases.skipped += casesSkipped;
	report.guilds[converted ? 'converted' : 'skipped']++;
}

/**
 * Copies the audit events. The chain head is taken only when the new chain is empty: on one that is not, the legacy
 * events are a chain of their own.
 */
async function convertAuditEvents(client: LegacyClient, found: ReadonlySet<string>, report: LegacyMigrationReport) {
	const events = await readLegacyRows(client, found, 'audit_event', (row) => row.id as string);
	if (events.length === 0) return;

	const heads = await readLegacyRows(client, found, 'audit_chain_head', (row) => row.id as string);
	await inTransaction(client, async () => {
		const { rows } = await client.query<{ empty: boolean }>(
			`SELECT NOT EXISTS (SELECT 1 FROM "AuditEvent") AND NOT EXISTS (SELECT 1 FROM "AuditChainHead" WHERE hash IS NOT NULL) AS empty`
		);
		report.auditEvents = await insertMissing(client, 'AuditEvent', events.map(convertLegacyAuditEvent));

		if (rows[0].empty && heads.length > 0) {
			await client.query(
				`INSERT INTO "AuditChainHead" (id, hash, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, updated_at = now()`,
				[heads[0].id, heads[0].hash]
			);
		}
	});
}

/**
 * Converts what the legacy tables of a database hold into the tables of the new schema, whenever they are there. Nothing
 * that is in the new tables is overwritten, and running it again changes nothing. A guild that fails is logged and tried
 * again at the next start: it never stops the others.
 *
 * @returns What it did, `null` when the database has no legacy tables.
 */
export async function migrateLegacyDatabase(options: LegacyMigrationOptions): Promise<LegacyMigrationReport | null> {
	const { client, log } = options;
	const found = await findLegacyTables(client);
	if (found.size === 0) return null;

	const report: LegacyMigrationReport = {
		guilds: { converted: 0, skipped: 0, failed: 0 },
		cases: { converted: 0, skipped: 0 },
		auditEvents: 0,
		commandLogs: 0,
		users: 0
	};

	const guilds = await readLegacyRows(client, found, 'guilds', (row) => row.id as string);
	const done = await client.query<{ id: string }>(`SELECT guild_id::text AS id FROM "LegacyMigratedGuild"`);
	const migrated = new Set(done.rows.map((row) => row.id));
	const pending = guilds.filter((row) => !migrated.has(row.id as string));
	report.guilds.skipped = guilds.length - pending.length;

	if (pending.length > 0) {
		const cases = await readLegacyRows(client, found, 'moderation', (row) => `${row.guild_id}:${row.case_id}`);
		const known = new Set(guilds.map((row) => row.id));
		const orphans = cases.filter((row) => !known.has(row.guild_id)).length;
		if (orphans > 0) log.warn(`[LEGACY] ${orphans} cases are of guilds the legacy table does not have, and were left out.`);

		for (const row of pending) {
			try {
				await convertGuild(
					options,
					row,
					cases.filter((entry) => entry.guild_id === row.id),
					report
				);
			} catch (error) {
				report.guilds.failed++;
				log.error(`[LEGACY] ${String(row.id)}: the conversion failed`, error);
			}
		}
	}

	try {
		await convertAuditEvents(client, found, report);
		const logs = await readLegacyRows(client, found, 'command_log', (row) => row.id as string);
		report.commandLogs = await insertMissing(
			client,
			'CommandLog',
			logs.map(convertLegacyCommandLog).filter((row) => row !== null)
		);
		const users = await readLegacyRows(client, found, 'user', (row) => row.id as string);
		report.users = await insertMissing(
			client,
			'User',
			users.map(convertLegacyUser).filter((row) => row !== null)
		);
	} catch (error) {
		log.error('[LEGACY] The conversion of the logs failed', error);
	}

	log.info(
		`[LEGACY] ${report.guilds.converted} guilds converted, ${report.guilds.skipped} already done, ${report.guilds.failed} failed; ` +
			`${report.cases.converted} cases, ${report.auditEvents} audit events, ${report.commandLogs} command logs and ${report.users} users added.`
	);
	return report;
}
