import { canManage } from '#lib/api/utils';
import { canManageServerSettings } from '#lib/structures/commands/permissions';
import { PermissionFlagsBits } from 'discord-api-types/v10';

vi.mock('#lib/structures/commands/permissions', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/structures/commands/permissions')>()),
	canManageServerSettings: vi.fn()
}));

const guild = { id: '254360814063058944', ownerId: '242043489611808769' } as never;

function member(id: string | null, permissions: bigint) {
	return {
		id,
		roles: { ids: ['541739191776575502'] },
		permissions: Promise.resolve({ has: (bit: bigint) => (permissions & bit) === bit })
	} as never;
}

describe('canManage', () => {
	beforeEach(() => vi.mocked(canManageServerSettings).mockReset().mockResolvedValue(false));

	test('GIVEN the owner THEN they may, without the rules being read', async () => {
		await expect(canManage(guild, member('242043489611808769', 0n))).resolves.toBe(true);
		expect(canManageServerSettings).not.toHaveBeenCalled();
	});

	test('GIVEN a member THEN the rule of the dashboard decides, with their roles and Manage Server', async () => {
		vi.mocked(canManageServerSettings).mockResolvedValue(true);

		await expect(canManage(guild, member('266624760782258186', PermissionFlagsBits.ManageGuild))).resolves.toBe(true);
		expect(canManageServerSettings).toHaveBeenCalledWith({
			guildId: '254360814063058944',
			userId: '266624760782258186',
			roleIds: ['541739191776575502'],
			manageGuild: true
		});
	});

	test('GIVEN a member with no ID THEN they may not', async () => {
		await expect(canManage(guild, member(null, PermissionFlagsBits.ManageGuild))).resolves.toBe(false);
		expect(canManageServerSettings).not.toHaveBeenCalled();
	});
});
