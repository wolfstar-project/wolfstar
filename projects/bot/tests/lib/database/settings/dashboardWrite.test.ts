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
	test('an administrator cannot deny themselves access', () => {
		expect(checkDashboardWrite({ ...base, changes: { permissionsUsers: [createAccessEntry('2', 'deny')] } })).toBe('lockout');
	});
	test('the owner may change access rules', () => {
		expect(checkDashboardWrite({ ...base, userId: '1', manageGuild: false, changes: { rolesAdmin: ['5'] } })).toBeNull();
	});
});
