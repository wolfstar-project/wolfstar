import { convertLegacyNodes } from '#lib/structures/commands-menu/conversion';
import type { CommandRestriction } from '#lib/structures/commands-menu/restrictions';
import { createCommand } from '#mocks/MockInstances';
import { createAccessEntry, type PermissionsNode } from 'wolfstar-database';

createCommand('warn', 'Moderation');
createCommand('ban', 'Moderation');
createCommand('ping', 'General');
createCommand('settings', 'Management');

const roleId = '541739191776575502';
const goneRoleId = '541743369081192451';
const userId = '266624760782258186';
const channelId = '111111111111111111';

function rule(command: string, overrides: Partial<CommandRestriction> = {}): CommandRestriction {
	return {
		command,
		allowedChannels: [],
		ignoredChannels: [],
		allowedRoles: [],
		ignoredRoles: [],
		allowedUsers: [],
		ignoredUsers: [],
		...overrides
	};
}

function convert(input: { users?: PermissionsNode[]; roles?: PermissionsNode[]; restrictions?: CommandRestriction[] }) {
	return convertLegacyNodes({
		users: input.users ?? [],
		roles: input.roles ?? [],
		restrictions: input.restrictions ?? [],
		existingRoleIds: new Set([roleId])
	});
}

describe('convertLegacyNodes', () => {
	test('GIVEN a role node THEN its allowed names allow the role and its denied names ignore it', () => {
		const result = convert({ roles: [{ id: roleId, allow: ['warn'], deny: ['Moderation.*'] }] });

		expect(result.restrictions).toEqual([rule('warn', { allowedRoles: [roleId] }), rule('Moderation.*', { ignoredRoles: [roleId] })]);
		expect(result.roles).toEqual([]);
		expect(result.converted).toEqual({ allow: 1, deny: 1 });
		expect(result.skipped).toEqual([]);
	});

	test('GIVEN the node of a member who left THEN it is converted all the same', () => {
		const result = convert({ users: [{ id: userId, allow: [], deny: ['Moderation.*'] }] });

		expect(result.restrictions).toEqual([rule('Moderation.*', { ignoredUsers: [userId] })]);
		expect(result.users).toEqual([]);
	});

	test('GIVEN a node whose allow covers a more specific deny THEN it is left, since the most specific rule would deny', () => {
		const node = { id: roleId, allow: ['*'], deny: ['warn'] };
		const result = convert({ roles: [node] });

		expect(result.skipped).toEqual([{ kind: 'role', node, reason: 'meaningChanges' }]);
		expect(result.roles).toEqual([node]);
		expect(result.restrictions).toEqual([]);
	});

	test('GIVEN a node with the same name in both lists THEN it is left', () => {
		const node = { id: userId, allow: ['ping'], deny: ['ping'] };

		expect(convert({ users: [node] }).skipped).toEqual([{ kind: 'user', node, reason: 'meaningChanges' }]);
	});

	test('GIVEN a command the bot does not have THEN the node is left', () => {
		const node = { id: userId, allow: [], deny: ['nosuchcommand'] };

		expect(convert({ users: [node] }).skipped).toEqual([{ kind: 'user', node, reason: 'unknownCommand' }]);
	});

	test('GIVEN the old name of the settings command THEN the node is left, the command cannot be restricted', () => {
		const node = { id: userId, allow: [], deny: ['conf'] };

		expect(convert({ users: [node] }).skipped).toEqual([{ kind: 'user', node, reason: 'protectedCommand' }]);
	});

	test.each([
		['every command', { allow: [], deny: ['*'] }],
		['the category of the settings', { allow: [], deny: ['Management.*'] }],
		['an allow on every command', { allow: ['*'], deny: [] }],
		['a command besides', { allow: ['ping'], deny: ['Management.*'] }]
	])('GIVEN a node that reaches /settings through %s THEN it is left, it decides who manages the server', (_, names) => {
		const node = { id: roleId, ...names };
		const result = convert({ roles: [node] });

		expect(result.skipped).toEqual([{ kind: 'role', node, reason: 'settingsAccess' }]);
		expect(result.roles).toEqual([node]);
		expect(result.restrictions).toEqual([]);
	});

	test('GIVEN the node of a role that is gone THEN it is dropped', () => {
		const result = convert({ roles: [{ id: goneRoleId, allow: [], deny: ['warn'] }] });

		expect(result).toMatchObject({ restrictions: [], roles: [], skipped: [], converted: { allow: 0, deny: 0 } });
	});

	test('GIVEN dashboard access rules THEN they stay as they are', () => {
		const users = [createAccessEntry(userId, 'deny')];
		const roles = [createAccessEntry(roleId, 'allow')];

		expect(convert({ users, roles })).toMatchObject({ users, roles, restrictions: [] });
	});

	test('GIVEN a rule the command already has THEN the node is added to it', () => {
		const result = convert({
			roles: [{ id: roleId, allow: ['warn'], deny: [] }],
			restrictions: [rule('warn', { ignoredChannels: [channelId] })]
		});

		expect(result.restrictions).toEqual([rule('warn', { ignoredChannels: [channelId], allowedRoles: [roleId] })]);
	});

	test.each([
		['ignores the role a node allows', { allow: ['warn'], deny: [] }, { ignoredRoles: [roleId] }],
		['allows the role a node denies', { allow: [], deny: ['warn'] }, { allowedRoles: [roleId] }]
	])('GIVEN a rule that %s THEN the node is left, the rule would win or lose in silence', (_, names, overrides) => {
		const node = { id: roleId, ...names };
		const restrictions = [rule('warn', overrides)];
		const result = convert({ roles: [node], restrictions });

		expect(result.skipped).toEqual([{ kind: 'role', node, reason: 'meaningChanges' }]);
		expect(result.restrictions).toEqual(restrictions);
		expect(result.roles).toEqual([node]);
	});

	test('GIVEN its own result THEN converting again changes nothing', () => {
		const first = convert({
			users: [{ id: userId, allow: [], deny: ['nosuchcommand'] }],
			roles: [{ id: roleId, allow: ['warn'], deny: ['Moderation.*'] }]
		});
		const second = convert({ users: first.users, roles: first.roles, restrictions: first.restrictions });

		expect(second.restrictions).toEqual(first.restrictions);
		expect(second.users).toEqual(first.users);
		expect(second.roles).toEqual(first.roles);
		expect(second.converted).toEqual({ allow: 0, deny: 0 });
	});
});
