import type { Database } from '../../src/index.js';
import { fetchAutoModerationRules } from '../../src/settings/automod/storage.js';
import { fetchWarnThresholds } from '../../src/settings/warnings/storage.js';

const Guild = '254360814063058944';

/** A database whose only table answers every read with these rows. */
function databaseWith(table: 'GuildAutoModerationRule' | 'GuildWarnThreshold', rows: object[]) {
	const orm = { public: { [table]: { where: () => ({ all: async () => rows }) } } };
	return { orm } as unknown as Database;
}

const rule = {
	id: 1n,
	guildId: BigInt(Guild),
	name: 'Spam',
	type: 'MessageSpam',
	enabled: true,
	softAction: [],
	hardAction: 'Timeout',
	hardActionDuration: 3_600_000,
	thresholdMaximum: 5,
	thresholdDuration: 60_000,
	ignoredRoles: [],
	ignoredChannels: [],
	options: {},
	escalation: [],
	escalationDuration: null,
	response: null,
	logChannelId: null
};

// Rows written before the migration, or after a rollback, still hold `Timeout`:
describe('a Timeout saved before the migration', () => {
	test('GIVEN a rule whose hard action is Timeout THEN it reads as a Mute', async () => {
		const [read] = await fetchAutoModerationRules(databaseWith('GuildAutoModerationRule', [rule]).orm, Guild);
		expect(read.hardAction).toBe('Mute');
		expect(read.hardActionDuration).toBe(3_600_000);
	});

	test('GIVEN a threshold whose action is Timeout THEN it reads as a Mute, and is kept', async () => {
		const db = databaseWith('GuildWarnThreshold', [{ guildId: BigInt(Guild), count: 3, period: 0, action: 'Timeout', duration: 1800 }]);
		await expect(fetchWarnThresholds(db, Guild)).resolves.toEqual([{ count: 3, period: 0, action: 'Mute', duration: 1_800_000 }]);
	});
});
