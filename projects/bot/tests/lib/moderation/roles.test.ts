import { cutRoleMentions, fetchMemberRoleIds, formatRoleMentions, MaximumRolesLength } from '#lib/moderation/common/roles';

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
		expect(mentions.join(' ').length).toBeLessThanOrEqual(MaximumRolesLength - 30);
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
