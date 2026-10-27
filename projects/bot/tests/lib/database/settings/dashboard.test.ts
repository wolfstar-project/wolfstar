import { readSettings, readSettingsCached } from '#lib/database';
import { dispatchShardMessage, onShardMessage } from '#lib/sharder/messages';
import { Events } from '#lib/types/Enums';
import { container } from '@wolfstar/http-framework';
import { shardIdForGuild } from '@wolfstar/plugin-sharder';
import { fetchGuildData, getDefaultGuildSettings, type GuildData } from 'wolfstar-database';

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchGuildData: vi.fn(async (_orm: unknown, id: string) => ({ ...getDefaultGuildSettings(), id }) as GuildData)
}));

const guildId = '254360814063058944';
const otherId = '266624760782258186';

describe('writes of the dashboard', () => {
	const emit = vi.fn();
	const automod = vi.fn();
	const joinGuard = vi.fn();

	beforeAll(() => {
		onShardMessage('automodRulesUpdate', automod);
		onShardMessage('joinGuardUpdate', joinGuard);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(container, { client: { emit }, prisma: { orm: {} }, redis: undefined, shard: null });
	});

	test('GIVEN a write THEN the settings and what derives from them are read again, and the event is emitted', async () => {
		await readSettings(guildId);
		expect(readSettingsCached(guildId)).not.toBeNull();

		dispatchShardMessage({ type: 'settingsUpdate', guildId, keys: ['honeypotChannel'] });

		expect(readSettingsCached(guildId)).toBeNull();
		expect(automod).toHaveBeenCalledWith({ type: 'automodRulesUpdate', guildId });
		expect(joinGuard).toHaveBeenCalledWith({ type: 'joinGuardUpdate', guildId });
		expect(emit).toHaveBeenCalledWith(Events.DashboardSettingsUpdate, guildId, ['honeypotChannel']);
	});

	test('GIVEN a write of the bot itself THEN it is not one of the dashboard', () => {
		dispatchShardMessage({ type: 'settingsUpdate', guildId });

		expect(emit).not.toHaveBeenCalled();
		expect(automod).not.toHaveBeenCalled();
	});

	test('GIVEN a write THEN only the shard that has the guild emits the event, every shard drops its copy', async () => {
		const shardCount = 4;
		const own = shardIdForGuild(guildId, shardCount);
		Object.assign(container, { shard: { shards: [own], shardCount } });
		const foreign = ['254360814063058944', '266624760782258186', '242043489611808769', '1043562833905987685'].find(
			(id) => shardIdForGuild(id, shardCount) !== own
		)!;

		await readSettings(foreign);
		dispatchShardMessage({ type: 'settingsUpdate', guildId: foreign, keys: ['logsWebhooks'] });
		dispatchShardMessage({ type: 'settingsUpdate', guildId, keys: ['logsWebhooks'] });

		expect(readSettingsCached(foreign)).toBeNull();
		expect(emit).toHaveBeenCalledTimes(1);
		expect(emit).toHaveBeenCalledWith(Events.DashboardSettingsUpdate, guildId, ['logsWebhooks']);
	});

	test('GIVEN the connection was down THEN every cached guild is read again', async () => {
		await readSettings(guildId);
		await readSettings(otherId);

		dispatchShardMessage({ type: 'settingsInvalidateAll' });

		expect(readSettingsCached(guildId)).toBeNull();
		expect(readSettingsCached(otherId)).toBeNull();
		await readSettings(guildId);
		expect(fetchGuildData).toHaveBeenCalledTimes(3);
	});
});
