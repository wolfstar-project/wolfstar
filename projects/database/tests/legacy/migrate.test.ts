import { migrateLegacyDatabase, type LegacyClient } from '../../src/legacy/migrate.js';
import type { LegacyRow } from '../../src/legacy/types.js';
import { createLegacyGuild } from './fixtures.js';

const First = '254360814063058944';
const Second = '254360814063058945';
const User = '254360814063058946';

const encodeCase = (type: number, metadata: number) => ({ action: 'Ban', metadata: (type << 8) | metadata });

function createLog() {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createCase(guildId: string, overrides: LegacyRow = {}): LegacyRow {
	return {
		case_id: 1,
		created_at: '2026-01-02T03:04:05.678912',
		guild_id: guildId,
		moderator_id: User,
		user_id: User,
		type: 0,
		metadata: 0,
		...overrides
	};
}

/**
 * A database of legacy tables and of the record of what was converted. The new tables are what `inserted` holds.
 */
class FakeDatabase implements LegacyClient {
	public readonly queries: string[] = [];
	public readonly inserted = new Map<string, LegacyRow[]>();
	public readonly migrated = new Set<string>();
	/** The IDs of the cases the new schema already has. */
	public readonly takenCases = new Set<number>();
	/** What a second process converts between the read of the record and the lock. */
	public convertedMeanwhile: string | null = null;

	public constructor(public readonly tables: Record<string, LegacyRow[]>) {}

	public async query(sql: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount: number | null }> {
		this.queries.push(sql);

		if (sql.includes('information_schema.tables'))
			return { rows: Object.keys(this.tables).map((table_name) => ({ table_name })), rowCount: null };
		if (sql.startsWith('SELECT to_jsonb')) {
			const [, table] = /FROM "(.+?)"/.exec(sql)!;
			return { rows: this.tables[table].map((row) => ({ row })), rowCount: null };
		}

		if (sql.startsWith('SELECT guild_id::text')) return { rows: [...this.migrated].map((id) => ({ id })), rowCount: null };
		if (sql.startsWith('SELECT 1 FROM "LegacyMigratedGuild"')) {
			const done = this.migrated.has(params[0] as string) || this.convertedMeanwhile === params[0];
			return { rows: done ? [{}] : [], rowCount: null };
		}

		if (sql.startsWith('INSERT INTO "LegacyMigratedGuild"')) {
			this.migrated.add(params[0] as string);
			return { rows: [], rowCount: 1 };
		}

		if (sql.includes('AS empty')) return { rows: [{ empty: !this.inserted.has('AuditEvent') }], rowCount: null };

		const insert = /^INSERT INTO "(.+?)"/.exec(sql);
		if (insert && sql.includes('jsonb_populate_recordset')) {
			const rows = JSON.parse(params[0] as string) as LegacyRow[];
			const table = this.inserted.get(insert[1]) ?? [];
			const fresh = rows.filter(
				(row) =>
					!table.some((other) => JSON.stringify(other) === JSON.stringify(row)) &&
					!(insert[1] === 'ModerationAction' && this.takenCases.has(row.id as number))
			);
			table.push(...fresh);
			this.inserted.set(insert[1], table);
			return { rows: sql.includes('RETURNING') ? fresh : [], rowCount: fresh.length };
		}

		return { rows: [], rowCount: null };
	}
}

describe('migrateLegacyDatabase', () => {
	test('GIVEN a database with no legacy tables THEN it asks once and writes nothing', async () => {
		const client = new FakeDatabase({});
		await expect(migrateLegacyDatabase({ client, encodeCase, log: createLog() })).resolves.toBeNull();
		expect(client.queries).toHaveLength(1);
	});

	test('GIVEN legacy tables THEN the guilds, their cases and the logs are converted, and a second run adds nothing', async () => {
		const client = new FakeDatabase({
			guilds: [createLegacyGuild({ id: First })],
			moderation: [createCase(First)],
			audit_event: [{ id: 'a', actor_id: 'web', target_id: null, tenant_id: null, timestamp: '2026-01-02T03:04:05.1', context: null }],
			audit_chain_head: [{ id: 'default', hash: 'b' }],
			command_log: [{ id: 'c', guild_id: First, user_id: User, command_id: null, channel_id: null, executed_at: '2026-01-02T03:04:05.1' }],
			user: [{ id: User, moderation_dm: false }]
		});
		const log = createLog();

		await expect(migrateLegacyDatabase({ client, encodeCase, log })).resolves.toEqual({
			guilds: { converted: 1, skipped: 0, failed: 0 },
			cases: { converted: 1, skipped: 0 },
			auditEvents: 1,
			commandLogs: 1,
			users: 1
		});
		expect(client.migrated).toEqual(new Set([First]));
		expect(client.queries.some((query) => query.includes('INSERT INTO "AuditChainHead"'))).toBe(true);

		await expect(migrateLegacyDatabase({ client, encodeCase, log })).resolves.toEqual({
			guilds: { converted: 0, skipped: 1, failed: 0 },
			cases: { converted: 0, skipped: 0 },
			auditEvents: 0,
			commandLogs: 0,
			users: 0
		});
		expect(log.error).not.toHaveBeenCalled();
	});

	test('GIVEN a guild in the record THEN it is not read again', async () => {
		const client = new FakeDatabase({ guilds: [createLegacyGuild({ id: First }), createLegacyGuild({ id: Second })] });
		client.migrated.add(First);

		const report = await migrateLegacyDatabase({ client, encodeCase, log: createLog() });

		expect(report?.guilds).toEqual({ converted: 1, skipped: 1, failed: 0 });
		expect(client.inserted.get('Guild')).toEqual([expect.objectContaining({ id: Second })]);
	});

	test('GIVEN a guild that cannot be converted THEN it is rolled back and logged, and the next one goes on', async () => {
		const client = new FakeDatabase({
			guilds: [createLegacyGuild({ id: First, 'channels.logs.prune': 'nope' }), createLegacyGuild({ id: Second })]
		});
		const log = createLog();

		const report = await migrateLegacyDatabase({ client, encodeCase, log });

		expect(report?.guilds).toEqual({ converted: 1, skipped: 0, failed: 1 });
		expect(client.queries).toContain('ROLLBACK');
		expect(client.migrated).toEqual(new Set([Second]));
		expect(log.error).toHaveBeenCalledTimes(1);
	});

	test('GIVEN the tables under both names THEN both are read, and the one under its own name wins', async () => {
		const client = new FakeDatabase({
			guilds: [createLegacyGuild({ id: First, language: 'it' })],
			guilds_v6: [createLegacyGuild({ id: First, language: 'de' }), createLegacyGuild({ id: Second })]
		});

		await migrateLegacyDatabase({ client, encodeCase, log: createLog() });

		expect(client.inserted.get('Guild')).toEqual([
			expect.objectContaining({ id: First, language: 'it' }),
			expect.objectContaining({ id: Second })
		]);
	});

	test('GIVEN a second process that converted the guild meanwhile THEN it is not converted again', async () => {
		const client = new FakeDatabase({ guilds: [createLegacyGuild({ id: First })] });
		client.convertedMeanwhile = First;

		const report = await migrateLegacyDatabase({ client, encodeCase, log: createLog() });

		expect(report?.guilds).toEqual({ converted: 0, skipped: 1, failed: 0 });
		expect(client.inserted.has('Guild')).toBe(false);
		expect(client.queries.findIndex((query) => query.includes('pg_advisory_xact_lock'))).toBeGreaterThan(-1);
	});

	test('GIVEN a case of a guild the table does not have THEN it is left out and told', async () => {
		const client = new FakeDatabase({ guilds: [createLegacyGuild({ id: First })], moderation: [createCase(Second)] });
		const log = createLog();

		const report = await migrateLegacyDatabase({ client, encodeCase, log });

		expect(report?.cases).toEqual({ converted: 0, skipped: 0 });
		expect(client.inserted.has('ModerationAction')).toBe(false);
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('1 cases'));
	});

	test('GIVEN a case that is not valid THEN the guild is converted without it', async () => {
		const client = new FakeDatabase({ guilds: [createLegacyGuild({ id: First })], moderation: [createCase(First, { user_id: null })] });
		const log = createLog();

		const report = await migrateLegacyDatabase({ client, encodeCase, log });

		expect(report?.cases).toEqual({ converted: 0, skipped: 1 });
		expect(report?.guilds.converted).toBe(1);
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('1 of 1 cases'));
	});

	test('GIVEN a case whose number is taken THEN it is told by its number, and its data does not go to the other case', async () => {
		const client = new FakeDatabase({
			guilds: [createLegacyGuild({ id: First })],
			moderation: [createCase(First, { extra_data: { roles: ['1'] } }), createCase(First, { case_id: 2, extra_data: { roles: ['2'] } })]
		});
		client.takenCases.add(1);
		const log = createLog();

		const report = await migrateLegacyDatabase({ client, encodeCase, log });

		expect(report?.cases).toEqual({ converted: 1, skipped: 1 });
		expect(client.inserted.get('ModerationCaseData')).toEqual([expect.objectContaining({ case_id: 2 })]);
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('cases 1 were left out'));
	});

	test('GIVEN a new chain that holds events THEN its head is left alone', async () => {
		const client = new FakeDatabase({
			audit_event: [{ id: 'a', actor_id: User, target_id: null, tenant_id: null, timestamp: '2026-01-02T03:04:05.1', context: null }],
			audit_chain_head: [{ id: 'default', hash: 'b' }]
		});
		client.inserted.set('AuditEvent', [{ id: 'existing' }]);

		await migrateLegacyDatabase({ client, encodeCase, log: createLog() });

		expect(client.queries.some((query) => query.includes('INSERT INTO "AuditChainHead"'))).toBe(false);
	});
});
