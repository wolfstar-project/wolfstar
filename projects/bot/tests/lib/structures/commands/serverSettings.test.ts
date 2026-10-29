import { deleteSettingsContext, readSettings } from '#lib/database';
import { canManageServerSettings, canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { container } from '@wolfstar/http-framework';
import { createDashboardAccessEntry, getDefaultGuildSettings, type PermissionsNode, type ReadonlyGuildData } from 'wolfstar-database';
import { createCommand } from '../../../mocks/MockInstances.js';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));

createCommand('settings', 'Management');

const guildId = '254360814063058944';
const ownerId = '242043489611808769';
const userId = '266624760782258186';
const lower = { id: '541743369081192451', position: 11 };
const higher = { id: '541739191776575502', position: 27 };

interface Columns {
	users?: PermissionsNode[];
	roles?: PermissionsNode[];
	rolesAdmin?: string[];
}

function mockSettings({ users = [], roles = [], rolesAdmin = [] }: Columns = {}) {
	// The legacy nodes are kept by guild and updated by the writes of the settings, which these tests do not make:
	deleteSettingsContext(guildId);
	vi.mocked(readSettings).mockResolvedValue({
		...getDefaultGuildSettings()!,
		id: guildId,
		permissionsUsers: users,
		permissionsRoles: roles,
		rolesAdmin
	} as ReadonlyGuildData);
}

function manager(overrides: { userId?: string; roleIds?: string[]; manageGuild?: boolean } = {}) {
	return { guildId, userId, roleIds: [lower.id, higher.id], manageGuild: false, ...overrides };
}

describe('canManageServerSettings', () => {
	// The tests have no gateway: the owner of the guild and its roles come from a stand-in client.
	const gatewayClient = container.gatewayClient;
	beforeEach(() => {
		container.gatewayClient = {
			guilds: { fetch: vi.fn().mockResolvedValue({ id: guildId, ownerId }) },
			roles: { fetchAll: vi.fn().mockResolvedValue([higher, lower]) }
		} as never;
	});

	afterEach(() => {
		container.gatewayClient = gatewayClient;
	});

	test('GIVEN the owner THEN they always may, a rule that denies them included', async () => {
		mockSettings({ users: [createDashboardAccessEntry(ownerId, 'deny')], roles: [{ id: higher.id, allow: [], deny: ['settings'] }] });

		await expect(canManageServerSettings(manager({ userId: ownerId }))).resolves.toBe(true);
	});

	test('GIVEN a rule that denies an administrator THEN they may not', async () => {
		mockSettings({ users: [createDashboardAccessEntry(userId, 'deny')] });
		await expect(canManageServerSettings(manager({ manageGuild: true }))).resolves.toBe(false);

		mockSettings({ roles: [createDashboardAccessEntry(higher.id, 'deny')] });
		await expect(canManageServerSettings(manager({ manageGuild: true }))).resolves.toBe(false);
	});

	test('GIVEN a rule that allows a member without Manage Server THEN they may', async () => {
		mockSettings({ roles: [createDashboardAccessEntry(lower.id, 'allow')] });

		await expect(canManageServerSettings(manager())).resolves.toBe(true);
	});

	test('GIVEN their own rule and a rule of their role THEN their own rule decides', async () => {
		mockSettings({ users: [createDashboardAccessEntry(userId, 'allow')], roles: [createDashboardAccessEntry(higher.id, 'deny')] });

		await expect(canManageServerSettings(manager())).resolves.toBe(true);
	});

	test('GIVEN rules on several of their roles THEN the highest role decides', async () => {
		mockSettings({ roles: [createDashboardAccessEntry(lower.id, 'allow'), createDashboardAccessEntry(higher.id, 'deny')] });

		await expect(canManageServerSettings(manager())).resolves.toBe(false);
		await expect(canManageServerSettings(manager({ roleIds: [lower.id] }))).resolves.toBe(true);
	});

	test('GIVEN no rule THEN an administrator may, unless a legacy node denies them the settings command', async () => {
		mockSettings();
		await expect(canManageServerSettings(manager({ manageGuild: true }))).resolves.toBe(true);
		await expect(canManageServerSettings(manager())).resolves.toBe(false);

		mockSettings({ rolesAdmin: [lower.id] });
		await expect(canManageServerSettings(manager())).resolves.toBe(true);
		await expect(canManageServerSettings(manager({ roleIds: [], manageGuild: true }))).resolves.toBe(false);

		mockSettings({ users: [{ id: userId, allow: [], deny: ['settings'] }] });
		await expect(canManageServerSettings(manager({ manageGuild: true }))).resolves.toBe(false);
	});

	test('GIVEN the member of an interaction THEN Manage Server or Administrator is read from its permissions', async () => {
		mockSettings();
		const member = (permissions: bigint) => ({ user: { id: userId }, roles: [], permissions: String(permissions) });

		await expect(canManageServerSettingsFrom({ guildId, member: member(1n << 5n) })).resolves.toBe(true);
		await expect(canManageServerSettingsFrom({ guildId, member: member(1n << 3n) })).resolves.toBe(true);
		await expect(canManageServerSettingsFrom({ guildId, member: member(1n << 10n) })).resolves.toBe(false);
	});
});
