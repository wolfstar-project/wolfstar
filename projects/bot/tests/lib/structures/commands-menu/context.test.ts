import { readSettings } from '#lib/database';
import { createCommandsMenuContext } from '#lib/structures/commands-menu';
import { hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { getDefaultGuildSettings, type GuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
vi.mock('#lib/structures/commands/permissions', async (original) => ({
	...(await original<typeof import('#lib/structures/commands/permissions')>()),
	hasCommandPermissionLevel: vi.fn()
}));
vi.mock('#lib/structures/commands-menu/catalog', async (original) => ({
	...(await original<typeof import('#lib/structures/commands-menu/catalog')>()),
	getCommandCatalog: () => [],
	fetchCommandIds: async () => new Map()
}));
vi.mock('@wolfstar/plugin-i18next', async (original) => ({
	...(await original<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: () => (key: string) => key
}));

const guildId = '254360814063058944';
const userId = '266624760782258186';
const interaction = { locale: 'en-US', guildId, member: { user: { id: userId }, roles: [], permissions: '0' } } as never;

describe('createCommandsMenuContext', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const permissionsUsers = [{ id: userId, allow: [], deny: ['*'] }] as unknown as GuildData['permissionsUsers'];
		const settings = { ...getDefaultGuildSettings()!, id: guildId, permissionsUsers } as GuildData;
		vi.mocked(readSettings).mockResolvedValue(settings as never);
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);
	});

	test('does not read the settings unless a page of the menu asks for the legacy notice', async () => {
		const context = await createCommandsMenuContext(interaction, userId);

		expect(context.hasLegacyPermissions).toBe(false);
		expect(readSettings).not.toHaveBeenCalled();
		expect(hasCommandPermissionLevel).not.toHaveBeenCalled();
	});

	test('shows the legacy notice to an administrator of a server that still stores nodes', async () => {
		await expect(createCommandsMenuContext(interaction, userId, { legacy: true })).resolves.toMatchObject({ hasLegacyPermissions: true });

		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);
		await expect(createCommandsMenuContext(interaction, userId, { legacy: true })).resolves.toMatchObject({ hasLegacyPermissions: false });
	});
});
