import { getDefaultAutoModerationRule, getDefaultGuildSettings, writeAutoModerationRulePlan, writeGuildData } from 'wolfstar-database';
import type { Database, DatabaseTransaction, ReadonlyGuildData } from 'wolfstar-database';

const guildId = '254360814063058944';

/**
 * A database that records what is written through it, and runs a transaction as the callback it is given. `commit`
 * lists what a transaction that did not throw wrote.
 */
function createDatabase() {
	const log: string[] = [];
	const committed: string[] = [];

	const table = (name: string) => ({
		upsert: async () => void log.push(`upsert ${name}`),
		where: (criteria: { id?: bigint }) => ({
			deleteAndCount: async () => void log.push(`delete ${name} ${criteria.id}`),
			updateAndCount: async (data: Record<string, unknown>) => void log.push(`update ${name} ${criteria.id} ${Object.keys(data).join(',')}`)
		}),
		create: async (data: Record<string, unknown>) => {
			log.push(`create ${name} ${data.name}`);
			return { id: 900n + BigInt(log.length), ...data };
		},
		createAndCount: async () => 0
	});
	const tx = { orm: { public: new Proxy({}, { get: (_, name: string) => table(name) }) } } as unknown as DatabaseTransaction;

	const db = {
		transaction: async (callback: (tx: DatabaseTransaction) => Promise<unknown>) => {
			const before = log.length;
			const result = await callback(tx);
			committed.push(...log.slice(before));
			return result;
		}
	} as unknown as Database;

	return { db, tx, log, committed };
}

const settings = { ...getDefaultGuildSettings(), id: guildId, modulesLogs: false } as ReadonlyGuildData;

describe('writeGuildData', () => {
	test('GIVEN what is written alongside THEN it runs in the transaction of the settings, after them', async () => {
		const { db, log, committed } = createDatabase();

		await writeGuildData(db, settings, { modulesLogs: false }, async () => void log.push('alongside'));

		expect(log.at(-1)).toBe('alongside');
		expect(log.indexOf('upsert Modules')).toBeLessThan(log.indexOf('alongside'));
		expect(committed).toEqual(log);
	});

	test('GIVEN what is written alongside fails THEN the transaction fails with it', async () => {
		const { db, committed } = createDatabase();

		await expect(
			writeGuildData(db, settings, { modulesLogs: false }, async () => {
				throw new Error('nope');
			})
		).rejects.toThrow('nope');
		expect(committed).toEqual([]);
	});

	test('GIVEN no setting changed THEN what is written alongside still runs', async () => {
		const { db, log } = createDatabase();

		await writeGuildData(db, settings, {}, async () => void log.push('alongside'));

		expect(log).toEqual(['alongside']);
	});

	test('GIVEN nothing to write THEN no transaction is made', async () => {
		const { db, log } = createDatabase();

		await writeGuildData(db, settings, {});

		expect(log).toEqual([]);
	});
});

describe('writeAutoModerationRulePlan', () => {
	test('GIVEN a plan THEN the rules are deleted, edited and created, in that order, for the guild', async () => {
		const { tx, log } = createDatabase();
		const create = { ...getDefaultAutoModerationRule('Links'), name: 'New' };

		const created = await writeAutoModerationRulePlan(tx, guildId, {
			remove: ['1'],
			update: [{ id: '2', data: { enabled: false } }],
			create: [create]
		});

		expect(log).toEqual([
			'upsert Guild',
			'delete GuildAutoModerationRule 1',
			'update GuildAutoModerationRule 2 enabled',
			'create GuildAutoModerationRule New'
		]);
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ name: 'New', type: 'Links', guildId });
	});

	test('GIVEN an ID that is not a row ID THEN it is never written', async () => {
		const { tx, log } = createDatabase();

		await writeAutoModerationRulePlan(tx, guildId, { remove: ['not-an-id'], update: [{ id: '-1', data: { enabled: false } }], create: [] });

		expect(log).toEqual(['upsert Guild']);
	});
});
