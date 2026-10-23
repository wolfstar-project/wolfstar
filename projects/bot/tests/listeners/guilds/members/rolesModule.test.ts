import { readSettings } from '#lib/database';
import { readRoleRules } from '#lib/roles/rules';
import { client, createGuildMember, createRole, guild, guildMemberData, userData } from '#mocks/MockInstances';
import { UserListener as GuildMemberAddListener } from '#root/listeners/guilds/members/guildMemberAdd';
import { UserListener as RoleRulesListener } from '#root/listeners/guilds/members/guildMemberUpdateRoleRules';
import { UserListener as InitialRolesListener } from '#root/listeners/guilds/members/notMutedMemberAddInitialRole';
import { container } from '@wolfstar/http-framework';
import { GuildMember, GuildMemberRoleManager } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, type APIUser } from 'discord-api-types/v10';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn(),
	writeSettings: vi.fn()
}));
vi.mock('#lib/roles/rules', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/roles/rules')>()),
	readRoleRules: vi.fn()
}));
// A member who joins is also given back the nickname a moderator made sticky, which these ones do not have:
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchStickyNickname: vi.fn(async () => null)
}));

// The listeners are run directly, so they are given the least a piece is built with:
function create<Piece extends object>(Piece_: new (context: never, options: never) => Piece, name: string): Piece {
	return new Piece_({ name, path: `/listeners/${name}.ts`, root: '/', store: { name: 'listeners' } } as never, {} as never);
}

function createUserData(id: string, username: string): APIUser {
	return { ...userData, id, username };
}

function mockSettings(settings: Partial<ReadonlyGuildData>) {
	vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guild.id, ...settings } as ReadonlyGuildData);
}

// The bot can give the roles below its own: its member is cached, with a role above the others that grants it.
const botRole = createRole({ id: '254360814063058950', name: 'WolfStar', position: 10, permissions: String(PermissionFlagsBits.ManageRoles) });
const bot = createGuildMember({ user: { ...createUserData('266624760782258190', 'WolfStar'), bot: true }, roles: [botRole.id] });

describe('the roles module (modules.roles) in the listeners of the members', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(client.members, 'me').mockReturnValue(bot);
		vi.spyOn(client.members, 'fetchMe').mockResolvedValue(bot);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('initial roles', () => {
		const listener = create(InitialRolesListener, 'notMutedMemberAddInitialRole');
		const initialRole = createRole({ id: '254360814063058951', name: 'Newcomer', position: 1 });
		const member = createGuildMember({ user: createUserData('266624760782258191', 'Newcomer') });

		async function join(modulesRoles: boolean) {
			mockSettings({ modulesRoles, rolesInitial: [initialRole.id] });
			const addRole = vi.spyOn(client.members, 'addRole').mockResolvedValue(undefined);

			await listener.run(member);
			return addRole;
		}

		test('GIVEN modules.roles off WHEN a member joins THEN no initial role is given', async () => {
			expect(await join(false)).not.toHaveBeenCalled();
		});

		test('GIVEN modules.roles on WHEN a member joins THEN the initial role is given', async () => {
			expect(await join(true)).toHaveBeenCalledExactlyOnceWith(guild.id, member.id, initialRole.id);
		});
	});

	describe('role rules', () => {
		const listener = create(RoleRulesListener, 'guildMemberUpdateRoleRules');
		const requiredRole = createRole({ id: '254360814063058952', name: 'Verified', position: 2 });
		const ruleRole = createRole({ id: '254360814063058953', name: 'Member', position: 3 });
		// The rule gives its role to the members who have the one it requires:
		const rule = { roleId: ruleRole.id, requiredRoles: [requiredRole.id], anyRoles: [], forbiddenRoles: [] };

		// A member who was just given the role the rule requires, as the gateway tells it, before and after:
		const user = createUserData('266624760782258192', 'Verified');
		const previous = new GuildMember({ ...guildMemberData, user, roles: [], guild_id: guild.id });
		const next = createGuildMember({ user, roles: [requiredRole.id] });

		// The edit gives Discord a reason in the language of the guild:
		beforeAll(() => container.i18n.init());

		async function update(modulesRoles: boolean) {
			mockSettings({ modulesRoles });
			vi.mocked(readRoleRules).mockResolvedValue([rule]);
			vi.spyOn(client.roles, 'fetchAll').mockResolvedValue([botRole, ruleRole, requiredRole]);
			const editMember = vi
				.spyOn(client.api.guilds, 'editMember')
				.mockResolvedValue({ ...guildMemberData, user, roles: [requiredRole.id, ruleRole.id] });

			await listener.run(previous, next);
			return editMember;
		}

		test('GIVEN modules.roles off WHEN the roles of a member change THEN no role rule is applied', async () => {
			expect(await update(false)).not.toHaveBeenCalled();
		});

		test('GIVEN modules.roles on WHEN the roles of a member change THEN the role of the rule they meet is given', async () => {
			expect(await update(true)).toHaveBeenCalledExactlyOnceWith(
				guild.id,
				user.id,
				{ roles: [requiredRole.id, ruleRole.id] },
				expect.anything()
			);
		});
	});

	describe('sticky roles', () => {
		const listener = create(GuildMemberAddListener, 'guildMemberAdd');
		const otherRole = createRole({ id: '254360814063058954', name: 'Artist', position: 4 });
		const restrictionRole = createRole({ id: '254360814063058955', name: 'No Reactions', position: 5 });
		const mutedRole = createRole({ id: '254360814063058956', name: 'Muted', position: 6 });
		const userId = '266624760782258193';
		const member = createGuildMember({ user: createUserData(userId, 'Returning') });

		async function rejoin(modulesRoles: boolean) {
			// The settings keep the roles they left with, one of their own and the one of a restriction of their reactions,
			// and they are not muted:
			mockSettings({
				modulesRoles,
				rolesMuted: mutedRole.id,
				rolesRestrictedReaction: restrictionRole.id,
				stickyRoles: [{ user: userId, roles: [otherRole.id, restrictionRole.id] }]
			});
			// `member.roles` is a new manager at each read, so the one of every member is spied on:
			const add = vi.spyOn(GuildMemberRoleManager.prototype, 'add').mockResolvedValue(member);

			await listener.run(member);
			return add;
		}

		test('GIVEN modules.roles off WHEN a restricted member joins again THEN only the restriction role is given back', async () => {
			expect(await rejoin(false)).toHaveBeenCalledExactlyOnceWith([restrictionRole.id]);
		});

		test('GIVEN modules.roles on WHEN a restricted member joins again THEN every sticky role is given back', async () => {
			expect(await rejoin(true)).toHaveBeenCalledExactlyOnceWith([otherRole.id, restrictionRole.id]);
		});
	});
});
