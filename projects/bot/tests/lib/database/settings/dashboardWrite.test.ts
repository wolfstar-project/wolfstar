import { checkDashboardWrite } from '#lib/database/settings/dashboardWrite';
import { createAccessEntry } from 'wolfstar-database';

const base = {
	ownerId: '1',
	userId: '2',
	guildId: '3',
	roleIds: ['4'],
	manageGuild: true,
	roles: [
		{ id: '3', position: 0 },
		{ id: '4', position: 10 },
		{ id: '5', position: 20 }
	],
	current: { rolesAdmin: [], permissionsUsers: [], permissionsRoles: [] }
};

describe('dashboard settings writes', () => {
	test('a member admitted only by a rule cannot change access rules', () => {
		expect(checkDashboardWrite({ ...base, manageGuild: false, changes: { rolesAdmin: ['4'] } })).toBe('not-administrator');
	});
	test('an administrator cannot change rules for a role above them', () => {
		expect(checkDashboardWrite({ ...base, changes: { permissionsRoles: [createAccessEntry('5', 'allow')] } })).toBe('outranked');
	});
	test('an administrator may change a lower role at the same position', () => {
		const roles = base.roles.map((role) => (role.id === '5' ? { ...role, position: 10 } : role));
		expect(checkDashboardWrite({ ...base, roles, changes: { permissionsRoles: [createAccessEntry('5', 'allow')] } })).toBeNull();
	});
	test('an administrator cannot change a higher role at the same position', () => {
		const roles = base.roles.map((role) => (role.id === '5' ? { ...role, position: 10 } : role));
		expect(checkDashboardWrite({ ...base, roles, roleIds: ['5'], changes: { permissionsRoles: [createAccessEntry('4', 'allow')] } })).toBe(
			'outranked'
		);
	});
	test('an unchanged rule remains unchanged when its properties have a different order', () => {
		const entry = { id: '5', deny: [], allow: [], dashboard: 'allow' as const };
		expect(
			checkDashboardWrite({
				...base,
				current: { ...base.current, permissionsRoles: [entry] },
				changes: { permissionsRoles: [createAccessEntry('5', 'allow')] }
			})
		).toBeNull();
	});
	test('an administrator cannot change the contents of a higher role rule', () => {
		const entry = createAccessEntry('5', 'allow');
		expect(
			checkDashboardWrite({
				...base,
				current: { ...base.current, permissionsRoles: [entry] },
				changes: { permissionsRoles: [createAccessEntry('5', 'deny')] }
			})
		).toBe('outranked');
	});
	test('an administrator cannot deny themselves access', () => {
		expect(checkDashboardWrite({ ...base, changes: { permissionsUsers: [createAccessEntry('2', 'deny')] } })).toBe('lockout');
	});
	test('an administrator cannot remove their only administrative access', () => {
		expect(checkDashboardWrite({ ...base, current: { ...base.current, rolesAdmin: ['4'] }, changes: { rolesAdmin: ['5'] } })).toBe('lockout');
	});
	test('a rule that allows the author preserves access after removing their admin role', () => {
		expect(
			checkDashboardWrite({
				...base,
				current: { ...base.current, rolesAdmin: ['4'], permissionsUsers: [createAccessEntry('2', 'allow')] },
				changes: { rolesAdmin: ['5'] }
			})
		).toBeNull();
	});
	test('the owner may change access rules', () => {
		expect(checkDashboardWrite({ ...base, userId: '1', manageGuild: false, changes: { rolesAdmin: ['5'] } })).toBeNull();
	});
});
