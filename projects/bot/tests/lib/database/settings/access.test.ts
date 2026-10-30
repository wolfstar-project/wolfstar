import { createAccessEntry, isAccessEntry, resolveAccess, type PermissionsNode } from 'wolfstar-database';

const userId = '266624760782258186';
const lower = { id: '541743369081192451', position: 11 };
const higher = { id: '541739191776575502', position: 27 };
const roles = [lower, higher];

function resolve(users: readonly PermissionsNode[], ruled: readonly PermissionsNode[], roleIds = [lower.id, higher.id], guildRoles = roles) {
	return resolveAccess({ userId, roleIds }, { users, roles: ruled }, guildRoles);
}

describe('resolveAccess', () => {
	test('GIVEN a rule of the member and one of their role THEN their own rule decides', () => {
		expect(resolve([createAccessEntry(userId, 'allow')], [createAccessEntry(higher.id, 'deny')])).toBe('allow');
		expect(resolve([createAccessEntry(userId, 'deny')], [createAccessEntry(higher.id, 'allow')])).toBe('deny');
	});

	test('GIVEN rules on several of their roles THEN the one of the highest role decides', () => {
		const ruled = [createAccessEntry(lower.id, 'allow'), createAccessEntry(higher.id, 'deny')];

		expect(resolve([], ruled)).toBe('deny');
		expect(resolve([], ruled, [lower.id])).toBe('allow');
	});

	test('GIVEN two ruled roles at the same position THEN the one with the higher ID decides', () => {
		const older = { id: '541743369081192451', position: 5 };
		const newer = { id: '637592502756704256', position: 5 };
		const ruled = [createAccessEntry(newer.id, 'allow'), createAccessEntry(older.id, 'deny')];

		expect(resolve([], ruled, [older.id, newer.id], [older, newer])).toBe('allow');
	});

	test('GIVEN no rule that names the member or one of their roles THEN nothing is decided', () => {
		expect(resolve([], [])).toBeNull();
		expect(resolve([createAccessEntry('1', 'allow')], [createAccessEntry('2', 'deny')])).toBeNull();
	});

	test('GIVEN legacy nodes of the member and their roles THEN they are not rules', () => {
		const users = [{ id: userId, allow: ['settings'], deny: [] }];
		const ruled = [{ id: higher.id, allow: [], deny: ['*'] }];

		expect(resolve(users, ruled)).toBeNull();
		expect(users.some(isAccessEntry)).toBe(false);
	});
});
