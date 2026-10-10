import { PermissionNodeAction, PermissionNodeManager } from '#lib/database';
import { getDefaultGuildSettings, type GuildData, type PermissionsNode } from 'wolfstar-database';
import { UserError } from '@wolfstar/http-framework';
import type { Guild, GuildMember, Role, User } from '@wolfstar/plugin-gateway';

import { client, createGuild, getCache, createGuildMember, createRole, createUser, roleData } from '../../../../mocks/MockInstances.js';

describe('PermissionNodeManager', () => {
	let guild: Guild;
	let entity: GuildData;
	let ctx: PermissionNodeManager | null;

	beforeEach(() => {
		// The manager sorts the role nodes by the roles of the guild, which it fetches from the API, highest first:
		vi.spyOn(client.roles, 'fetchAll').mockImplementation((guildId) =>
			Promise.resolve([...getCache(client.roles).values()].filter((role) => role.guildId === guildId).sort((a, b) => b.position - a.position))
		);

		guild = createGuild();
		entity = Object.assign(Object.create(null), getDefaultGuildSettings(), { id: guild.id });
		ctx = null;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function readSettingsPermissionNodes() {
		return (ctx ??= new PermissionNodeManager(entity));
	}

	function getSorted() {
		const ctx = readSettingsPermissionNodes();
		return ctx['sorted'];
	}

	describe('has', () => {
		test('GIVEN a guild with no roles THEN returns false', () => {
			const ctx = readSettingsPermissionNodes();
			expect(ctx.has('1')).toBe(false);
		});
	});

	async function apply(target: User | GuildMember | Role, nodes: readonly PermissionsNode[]) {
		const ctx = readSettingsPermissionNodes();
		Object.assign(entity, { [ctx.settingsPropertyFor(target)]: nodes });
		await ctx.refresh(entity);
	}

	describe('add', () => {
		async function add(target: User | GuildMember | Role, command: string, action: PermissionNodeAction) {
			const ctx = readSettingsPermissionNodes();
			const nodes = ctx.add(target, command, action);
			await apply(target, nodes);
		}

		describe('user', () => {
			const user = createUser();

			test('GIVEN an User with no node THEN creates new one', async () => {
				await add(user, 'ping', PermissionNodeAction.Allow);

				expect(entity.permissionsRoles).toEqual<PermissionsNode[]>([]);
				expect(entity.permissionsUsers).toEqual<PermissionsNode[]>([{ id: user.id, allow: ['ping'], deny: [] }]);
			});

			test('GIVEN an User with a node THEN modifies existing one', async () => {
				await add(user, 'ping', PermissionNodeAction.Allow);
				await add(user, 'balance', PermissionNodeAction.Allow);

				expect(entity.permissionsRoles).toEqual<PermissionsNode[]>([]);
				expect(entity.permissionsUsers).toEqual<PermissionsNode[]>([{ id: user.id, allow: ['ping', 'balance'], deny: [] }]);
			});
		});

		describe('member', () => {
			const member = createGuildMember({}, guild);

			test('GIVEN a GuildMember with no node THEN creates new one', async () => {
				await add(member, 'ping', PermissionNodeAction.Deny);

				expect(entity.permissionsRoles).toEqual<PermissionsNode[]>([]);
				expect(entity.permissionsUsers).toEqual<PermissionsNode[]>([{ id: member.id!, allow: [], deny: ['ping'] }]);
			});

			test('GIVEN a GuildMember with a node THEN modifies existing one', async () => {
				await add(member, 'ping', PermissionNodeAction.Deny);
				await add(member, 'balance', PermissionNodeAction.Deny);

				expect(entity.permissionsRoles).toEqual<PermissionsNode[]>([]);
				expect(entity.permissionsUsers).toEqual<PermissionsNode[]>([{ id: member.id!, allow: [], deny: ['ping', 'balance'] }]);
			});
		});

		describe('role', () => {
			test('GIVEN a Role with no node THEN creates new one', async () => {
				const role = getCache(client.roles).get(client.roles.resolveKey(guild.id, roleData.id))!;
				await add(role, 'ping', PermissionNodeAction.Allow);

				expect(entity.permissionsRoles).toEqual<PermissionsNode[]>([{ id: role.id, allow: ['ping'], deny: [] }]);
				expect(entity.permissionsUsers).toEqual<PermissionsNode[]>([]);
			});

			test('GIVEN a Role with a node THEN modifies existing one', async () => {
				const role = getCache(client.roles).get(client.roles.resolveKey(guild.id, roleData.id))!;
				await add(role, 'ping', PermissionNodeAction.Allow);
				await add(role, 'balance', PermissionNodeAction.Deny);

				expect(entity.permissionsRoles).toEqual<PermissionsNode[]>([{ id: role.id, allow: ['ping'], deny: ['balance'] }]);
				expect(entity.permissionsUsers).toEqual<PermissionsNode[]>([]);
			});
		});
	});

	describe('reset', () => {
		async function reset(target: User | GuildMember | Role) {
			const ctx = readSettingsPermissionNodes();
			const nodes = ctx.reset(target);
			await apply(target, nodes);
		}

		describe('user', () => {
			const user = createUser();

			test('GIVEN an empty node THEN throws error', async () => {
				let caughtError: unknown;
				try {
					await reset(user);
				} catch (e) {
					caughtError = e;
				}

				expect(caughtError).toBeDefined();
				const casted = caughtError as UserError;
				expect(casted).toBeInstanceOf(UserError);
				expect(casted.identifier).toBe('commands/management:permissionNodesNodeNotExists');
				expect((casted.context as { target: typeof user }).target).toBe(user);
			});
		});

		describe('member', () => {
			test('GIVEN an empty node THEN throws error', async () => {
				const member = createGuildMember({}, guild);

				let caughtError: unknown;
				try {
					await reset(member);
				} catch (e) {
					caughtError = e;
				}

				expect(caughtError).toBeDefined();
				const casted = caughtError as UserError;
				expect(casted).toBeInstanceOf(UserError);
				expect(casted.identifier).toBe('commands/management:permissionNodesNodeNotExists');
				expect((casted.context as { target: typeof member }).target).toBe(member);
			});
		});

		describe('role', () => {
			test('GIVEN an empty node THEN throws error', async () => {
				const role = createGuildMember({}, guild);

				let caughtError: unknown;
				try {
					await reset(role);
				} catch (e) {
					caughtError = e;
				}

				expect(caughtError).toBeDefined();
				const casted = caughtError as UserError;
				expect(casted).toBeInstanceOf(UserError);
				expect(casted.identifier).toBe('commands/management:permissionNodesNodeNotExists');
				expect((casted.context as { target: typeof role }).target).toBe(role);
			});
		});
	});

	describe('refresh', () => {
		test('GIVEN no roles THEN returns early', async () => {
			const ctx = readSettingsPermissionNodes();
			await ctx.refresh(entity);

			expect(getSorted().size).toBe(0);
		});

		test('GIVEN valid roles THEN the sorted permission nodes are in correct order', async () => {
			const roleDeveloper = createRole({ id: '541739191776575502', name: 'Developer', position: 27 }, guild);
			const roleModerator = createRole({ id: '637592502756704256', name: 'Moderator', position: 26 }, guild);
			const roleContributor = createRole({ id: '635547552229490708', name: 'Contributor', position: 18 }, guild);
			const roleAlumni = createRole({ id: '541743369081192451', name: 'Alumni', position: 11 }, guild);

			entity.permissionsRoles = [
				{ id: roleModerator.id, allow: ['balance'], deny: [] },
				{ id: roleAlumni.id, allow: [], deny: ['balance'] },
				{ id: roleDeveloper.id, allow: ['ping'], deny: [] },
				{ id: roleContributor.id, allow: [], deny: ['ping'] }
			];

			const ctx = readSettingsPermissionNodes();
			entity.permissionsRoles = (await ctx.refresh(entity)) as PermissionsNode[];

			const sorted = [...getSorted().entries()];
			expect(sorted.length).toBe(4);
			expect(sorted[0]).toEqual([roleDeveloper.id, { allow: new Set(['ping']), deny: new Set() }]);
			expect(sorted[1]).toEqual([roleModerator.id, { allow: new Set(['balance']), deny: new Set() }]);
			expect(sorted[2]).toEqual([roleContributor.id, { allow: new Set(), deny: new Set(['ping']) }]);
			expect(sorted[3]).toEqual([roleAlumni.id, { allow: new Set(), deny: new Set(['balance']) }]);
		});
	});
});
