import { readSettingsCached, readSettingsPermissionNodes, writeSettings } from '#lib/database';
import { UserListener } from '#root/listeners/guilds/roles/roleUpdate';
import { container } from '@wolfstar/http-framework';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettingsCached: vi.fn(),
	readSettingsPermissionNodes: vi.fn(),
	writeSettings: vi.fn()
}));

const guildId = '254360814063058944';
const roleId = '254360814063058945';
const botId = '266624760782258186';

describe('roleUpdate', () => {
	const gatewayClient = container.gatewayClient;
	afterEach(() => {
		container.gatewayClient = gatewayClient;
		vi.unstubAllEnvs();
	});

	test('GIVEN a worker, whose client has no user WHEN a ruled role moves THEN the settings are written by the bot', async () => {
		// A worker replays the dispatches and never gets `READY`, so its client has no user:
		vi.stubEnv('CLIENT_ID', botId);
		container.gatewayClient = { user: null, guilds: { resolve: async () => ({ available: true }) } } as never;
		vi.mocked(readSettingsCached).mockReturnValue({ id: guildId } as never);
		vi.mocked(readSettingsPermissionNodes).mockReturnValue({ has: () => true, refresh: async () => [] } as never);
		const listener = new UserListener(
			{ name: 'roleUpdate', path: '/listeners/roleUpdate.ts', root: '/', store: { name: 'listeners' } } as never,
			{} as never
		);

		await listener.run({ position: 1 } as never, { id: roleId, guildId, position: 2 } as never);

		expect(writeSettings).toHaveBeenCalledWith(expect.anything(), { permissionsRoles: [] }, botId);
	});
});
