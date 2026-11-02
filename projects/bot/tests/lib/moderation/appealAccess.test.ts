import { readSettings } from '#lib/database';
import { hasAppealAccess, hasAppealAccessFrom, isAppealManager } from '#lib/moderation/appealAccess';
import { container } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';

vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));

const guildId = '254360814063058944';
const ownerId = '242043489611808769';
const userId = '266624760782258186';

describe('who reviews the appeals', () => {
	const reviewer = (roleIds: string[], permissions = 0n) => ({ userId, roleIds, permissions });
	const settings = (appealsManagerRoles: string[], rolesModerator: string[] = [], rolesAdmin: string[] = []) =>
		({ appealsManagerRoles, rolesModerator, rolesAdmin }) as never;
	const fetchMember = vi.fn();
	const fetchGuild = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(readSettings).mockResolvedValue(settings([]));
		fetchGuild.mockResolvedValue({ id: guildId, ownerId });
		Object.assign(container, { gatewayClient: { members: { fetch: fetchMember }, guilds: { fetch: fetchGuild } } });
	});

	test('GIVEN no moderator nor administrator roles THEN Ban Members, Manage Server or Administrator reviews, and a plain member does not', () => {
		expect(isAppealManager(reviewer(['1']), settings([]), ownerId)).toBe(false);
		expect(isAppealManager(reviewer(['1'], PermissionFlagsBits.BanMembers), settings([]), ownerId)).toBe(true);
		expect(isAppealManager(reviewer(['1'], PermissionFlagsBits.ManageGuild), settings([]), ownerId)).toBe(true);
		expect(isAppealManager(reviewer(['1'], PermissionFlagsBits.Administrator), settings([]), ownerId)).toBe(true);
	});

	test('GIVEN moderator roles THEN they review, and Ban Members alone does not', () => {
		expect(isAppealManager(reviewer(['2']), settings([], ['2'], ['3']), ownerId)).toBe(true);
		expect(isAppealManager(reviewer(['1'], PermissionFlagsBits.BanMembers), settings([], ['2'], ['3']), ownerId)).toBe(false);
	});

	test('GIVEN the owner THEN they review', () => {
		expect(isAppealManager({ ...reviewer([]), userId: ownerId }, settings([], ['2'], ['3']), ownerId)).toBe(true);
	});

	test('GIVEN a manager role THEN it lets a plain member in', () => {
		expect(isAppealManager(reviewer(['1']), settings(['1']), ownerId)).toBe(true);
	});

	test('GIVEN a manager role the member does not hold THEN they stay out', () => {
		expect(isAppealManager(reviewer(['2']), settings(['1']), ownerId)).toBe(false);
	});

	test('GIVEN a user who left THEN they have no access, and nothing throws', async () => {
		fetchMember.mockRejectedValue(new Error('Unknown Member'));

		expect(await hasAppealAccess(guildId, userId)).toBe(false);
	});

	test('GIVEN a member of the dashboard THEN their permissions are read with every role, not from the cache', async () => {
		const fetchPermissions = vi.fn().mockResolvedValue({ bitField: PermissionFlagsBits.BanMembers });
		fetchMember.mockResolvedValue({ roleIds: ['1'], fetchPermissions });

		expect(await hasAppealAccess(guildId, userId)).toBe(true);
		expect(fetchPermissions).toHaveBeenCalledOnce();
	});

	test('GIVEN an interaction THEN the member Discord sent decides, and no member is fetched', async () => {
		const member = (permissions: bigint, roles: string[] = []) => ({ user: { id: userId }, roles, permissions: String(permissions) });

		expect(await hasAppealAccessFrom({ guildId, member: member(PermissionFlagsBits.BanMembers) })).toBe(true);
		expect(await hasAppealAccessFrom({ guildId, member: member(0n) })).toBe(false);

		vi.mocked(readSettings).mockResolvedValue(settings(['1']));
		expect(await hasAppealAccessFrom({ guildId, member: member(0n, ['1']) })).toBe(true);
		expect(fetchMember).not.toHaveBeenCalled();
	});
});
