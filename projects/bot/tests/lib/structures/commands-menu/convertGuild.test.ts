import { writeSettingsTransaction } from '#lib/database';
import { convertGuildCommandRules } from '#lib/structures/commands-menu/convertGuild';
import { createCommand } from '#mocks/MockInstances';
import { container } from '@wolfstar/http-framework';
import { createAccessEntry, getDefaultGuildSettings, type GuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	writeSettingsTransaction: vi.fn()
}));

createCommand('warn', 'Moderation');

const guildId = '254360814063058944';
const roleId = '541739191776575502';
const actorId = '266624760782258185';

describe('convertGuildCommandRules', () => {
	const gatewayClient = container.gatewayClient;
	const written: Record<string, unknown>[] = [];
	const submitWithAudit = vi.fn();
	let settings: GuildData;

	beforeEach(() => {
		written.length = 0;
		submitWithAudit.mockReset();
		settings = { ...getDefaultGuildSettings()!, id: guildId } as GuildData;
		container.gatewayClient = { roles: { fetchAll: vi.fn().mockResolvedValue([{ id: roleId, position: 1 }]) } } as never;
		vi.mocked(writeSettingsTransaction).mockImplementation(
			async () =>
				({
					settings,
					write(data: Record<string, unknown>) {
						written.push(data);
						return this;
					},
					submitWithAudit,
					[Symbol.dispose]() {}
				}) as never
		);
	});

	afterEach(() => {
		container.gatewayClient = gatewayClient;
	});

	test('GIVEN legacy nodes THEN the rules and the two columns are written together, and audited', async () => {
		const rule = createAccessEntry(roleId, 'allow');
		settings.permissionsRoles = [{ id: roleId, allow: [], deny: ['warn'] }, rule];

		const result = await convertGuildCommandRules(guildId, actorId);

		expect(result?.converted).toEqual({ allow: 0, deny: 1 });
		expect(written).toEqual([
			{
				commandsRestrictions: [
					{
						command: 'warn',
						allowedChannels: [],
						ignoredChannels: [],
						allowedRoles: [],
						ignoredRoles: [roleId],
						allowedUsers: [],
						ignoredUsers: []
					},
					{ format: 2 }
				],
				permissionsUsers: [],
				permissionsRoles: [rule]
			}
		]);
		expect(submitWithAudit).toHaveBeenCalledWith(actorId);
	});

	test('GIVEN a slow answer of Discord THEN the roles are read before the settings are locked', async () => {
		settings.permissionsRoles = [{ id: roleId, allow: [], deny: ['warn'] }];

		await convertGuildCommandRules(guildId, actorId);

		const [fetched] = vi.mocked(container.gatewayClient.roles.fetchAll).mock.invocationCallOrder;
		const [locked] = vi.mocked(writeSettingsTransaction).mock.invocationCallOrder.slice(-1);
		expect(fetched).toBeLessThan(locked);
	});

	test('GIVEN a guild with no legacy node THEN nothing is written', async () => {
		settings.permissionsUsers = [createAccessEntry(actorId, 'deny')];

		await expect(convertGuildCommandRules(guildId, actorId)).resolves.toBeNull();
		expect(written).toEqual([]);
		expect(submitWithAudit).not.toHaveBeenCalled();
	});
});
