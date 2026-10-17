import {
	cutRoleMentions,
	fetchCaseMemberRoleIds,
	fetchMemberRoleIds,
	formatCaseRoleMentions,
	formatRoleMentions,
	MaximumRolesLength,
	OmittedRolesReserve
} from '#lib/moderation/common/roles';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';

describe('cutRoleMentions', () => {
	const ids = Array.from({ length: 60 }, (_, index) => `${254360814063058000n + BigInt(index)}`);

	test('GIVEN few roles THEN all are mentioned', () => {
		expect(cutRoleMentions(ids.slice(0, 3))).toEqual({
			mentions: ids.slice(0, 3).map((id) => `<@&${id}>`),
			omitted: 0
		});
	});

	test('GIVEN no roles THEN nothing is mentioned', () => {
		expect(cutRoleMentions([])).toEqual({ mentions: [], omitted: 0 });
	});

	test('GIVEN too many roles THEN the ones that do not fit are counted', () => {
		const { mentions, omitted } = cutRoleMentions(ids);

		expect(omitted).toBeGreaterThan(0);
		expect(mentions.length + omitted).toBe(ids.length);
		// The roles kept are the first ones, in order, and leave room for the count:
		expect(mentions).toEqual(ids.slice(0, mentions.length).map((id) => `<@&${id}>`));
		expect(mentions.join(' ').length).toBeLessThanOrEqual(MaximumRolesLength - OmittedRolesReserve);
	});
});

describe('formatRoleMentions', () => {
	const t = ((key: string, options?: { count?: number }) => `${key}:${options?.count}`) as never;

	test('GIVEN no roles THEN there is nothing to show', () => {
		expect(formatRoleMentions(t, [])).toBeNull();
	});

	test('GIVEN roles THEN they are mentions', () => {
		expect(formatRoleMentions(t, ['1', '2'])).toBe('<@&1> <@&2>');
	});

	test('GIVEN too many roles THEN the count of the omitted ones follows', () => {
		const ids = Array.from({ length: 60 }, (_, index) => `${254360814063058000n + BigInt(index)}`);
		const text = formatRoleMentions(t, ids)!;

		expect(text).toMatch(/ moderation:rolesOmitted:\d+$/);
		expect(text.length).toBeLessThanOrEqual(MaximumRolesLength);
	});
});

describe('fetchMemberRoleIds', () => {
	const guildId = '254360814063058944';
	const role = (id: string, position: number, managed = false) => ({ id, position, managed });
	const member = (roles: ReturnType<typeof role>[], partial = false) =>
		({ id: '1', guildId, partial, roles: { fetch: async () => roles } }) as never;

	test('GIVEN no member THEN there are no roles', async () => {
		await expect(fetchMemberRoleIds(null)).resolves.toEqual([]);
		await expect(fetchMemberRoleIds(undefined)).resolves.toEqual([]);
	});

	test('GIVEN a partial member THEN its roles are not known', async () => {
		await expect(fetchMemberRoleIds(member([role('10', 1)], true))).resolves.toEqual([]);
	});

	test('GIVEN a member THEN @everyone and the managed roles are left out, highest first', async () => {
		const roles = [role(guildId, 0), role('10', 1), role('11', 5, true), role('12', 3)];
		await expect(fetchMemberRoleIds(member(roles))).resolves.toEqual(['12', '10']);
	});

	test('GIVEN roles that cannot be read THEN there are none', async () => {
		const broken = { id: '1', guildId, partial: false, roles: { fetch: async () => Promise.reject(new Error('nope')) } } as never;
		await expect(fetchMemberRoleIds(broken)).resolves.toEqual([]);
	});
});

describe('fetchCaseMemberRoleIds', () => {
	const guildId = '254360814063058944';
	const guild = { id: guildId } as never;
	const cached = new Map<string, unknown>();
	const members = { cache: { get: async (key: string) => cached.get(key) }, resolveKey: (guild: string, user: string) => `${guild}:${user}` };
	let previous: unknown;

	beforeAll(() => {
		previous = (container as any).gatewayClient;
		(container as any).gatewayClient = { members };
	});

	afterAll(() => {
		(container as any).gatewayClient = previous;
	});

	beforeEach(() => cached.clear());

	function cache(userId: string, roles: { id: string; position: number; managed: boolean }[]) {
		cached.set(`${guildId}:${userId}`, { id: userId, guildId, partial: false, roles: { fetch: async () => roles } });
	}

	test('GIVEN a cached member THEN its roles are kept, by ID or by user', async () => {
		cache('1', [
			{ id: '10', position: 1, managed: false },
			{ id: '12', position: 3, managed: false }
		]);

		await expect(fetchCaseMemberRoleIds(guild, '1')).resolves.toEqual(['12', '10']);
		await expect(fetchCaseMemberRoleIds(guild, { id: '1' })).resolves.toEqual(['12', '10']);
	});

	test('GIVEN a member read before it leaves the cache THEN the roles are still the ones it had', async () => {
		cache('1', [{ id: '10', position: 1, managed: false }]);

		const roles = fetchCaseMemberRoleIds(guild, '1');
		// What the ban does to the cache:
		cached.clear();

		await expect(roles).resolves.toEqual(['10']);
		await expect(fetchCaseMemberRoleIds(guild, '1')).resolves.toBeNull();
	});

	test('GIVEN a member with no roles to keep THEN there is nothing to store', async () => {
		cache('1', [{ id: guildId, position: 0, managed: false }]);

		await expect(fetchCaseMemberRoleIds(guild, '1')).resolves.toBeNull();
	});

	test('GIVEN a member that is not cached THEN there is nothing to store', async () => {
		await expect(fetchCaseMemberRoleIds(guild, '2')).resolves.toBeNull();
	});
});

describe('formatCaseRoleMentions', () => {
	const t = ((key: string, options?: { count?: number }) => `${key}:${options?.count}`) as never;
	const entry = (type: TypeVariation, extraData: unknown, undo = false) => ({ type, extraData, isUndo: () => undo });

	test.each([TypeVariation.Ban, TypeVariation.Softban, TypeVariation.Kick])('GIVEN a case of type %s with roles THEN they are shown', (type) => {
		expect(formatCaseRoleMentions(t, entry(type, ['1', '2']))).toBe('<@&1> <@&2>');
	});

	test('GIVEN the case that undoes a ban THEN no roles are shown', () => {
		expect(formatCaseRoleMentions(t, entry(TypeVariation.Ban, ['1', '2'], true))).toBeNull();
	});

	test('GIVEN a case of another type THEN its extra data is not read as roles', () => {
		expect(formatCaseRoleMentions(t, entry(TypeVariation.Warning, ['1', '2']))).toBeNull();
	});

	test('GIVEN a case made before the roles were kept THEN no roles are shown', () => {
		expect(formatCaseRoleMentions(t, entry(TypeVariation.Ban, null))).toBeNull();
		expect(formatCaseRoleMentions(t, entry(TypeVariation.Kick, []))).toBeNull();
	});
});
