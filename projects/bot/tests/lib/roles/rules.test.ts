import { checkRoleRule, getRoleRuleChanges, matchesRoleRule, RoleRuleError } from '#lib/roles/rules';

describe('role rules', () => {
	const rule = (roleId: string, requiredRoles: string[] = [], anyRoles: string[] = [], forbiddenRoles: string[] = []) => ({
		roleId,
		requiredRoles,
		anyRoles,
		forbiddenRoles
	});

	describe('matchesRoleRule', () => {
		const access = rule('access', ['verified', 'adult'], ['eu', 'us'], ['muted']);

		test('GIVEN a member with every required role, one of the others and none of the forbidden THEN they meet it', () => {
			expect(matchesRoleRule(access, new Set(['verified', 'adult', 'us']))).toBe(true);
		});

		test('GIVEN a member who lacks a required role THEN they do not', () => {
			expect(matchesRoleRule(access, new Set(['verified', 'us']))).toBe(false);
		});

		test('GIVEN a member with none of the any-of roles THEN they do not', () => {
			expect(matchesRoleRule(access, new Set(['verified', 'adult']))).toBe(false);
		});

		test('GIVEN a member with a forbidden role THEN they do not', () => {
			expect(matchesRoleRule(access, new Set(['verified', 'adult', 'eu', 'muted']))).toBe(false);
		});
	});

	describe('getRoleRuleChanges', () => {
		test('GIVEN a member who meets a rule without its role THEN it is given, and one who stopped meeting it loses it', () => {
			const rules = [rule('a', ['x']), rule('b', [], [], ['y'])];

			expect(getRoleRuleChanges(rules, new Set(['x', 'y', 'b']))).toEqual({ add: ['a'], remove: ['b'] });
		});

		test('GIVEN a member whose roles already match THEN nothing changes', () => {
			expect(getRoleRuleChanges([rule('a', ['x'])], new Set(['x', 'a']))).toEqual({ add: [], remove: [] });
		});
	});

	describe('checkRoleRule', () => {
		test('GIVEN a rule that reads its own role THEN it is refused', () => {
			expect(() => checkRoleRule([], rule('a', ['a']))).toThrow(RoleRuleError);
		});

		test('GIVEN a rule that reads the role of another rule THEN it is refused', () => {
			expect(() => checkRoleRule([rule('b', ['x'])], rule('a', [], [], ['b']))).toThrow(RoleRuleError);
		});

		test('GIVEN a rule whose role another rule reads THEN it is refused', () => {
			expect(() => checkRoleRule([rule('b', [], [], ['a'])], rule('a', ['x']))).toThrow(RoleRuleError);
		});

		test('GIVEN a rule that replaces the one of its role THEN only the others are checked', () => {
			expect(() => checkRoleRule([rule('a', ['y'])], rule('a', ['x']))).not.toThrow();
		});
	});
});
