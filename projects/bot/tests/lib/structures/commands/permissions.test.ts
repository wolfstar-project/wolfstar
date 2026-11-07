import { readSettings } from '#lib/database';
import {
	CommandPermissionLevel,
	getRequiredCommandPermissionLevel,
	hasCommandPermissionLevel,
	RequiresCommandPermissionLevel
} from '#lib/structures/commands/permissions';
import { container } from '@wolfstar/http-framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));

function decorate(prototype: object, method: string, level: CommandPermissionLevel) {
	RequiresCommandPermissionLevel(level)(prototype, method, Object.getOwnPropertyDescriptor(prototype, method)!);
}

describe('getRequiredCommandPermissionLevel', () => {
	test('GIVEN a piece whose chatInputRun requires a level THEN it is read, from a class that extends it too', () => {
		class Administrators {
			public chatInputRun() {
				return null;
			}
		}
		decorate(Administrators.prototype, 'chatInputRun', CommandPermissionLevel.Administrator);
		class Extended extends Administrators {}

		expect(getRequiredCommandPermissionLevel(new Administrators())).toBe(CommandPermissionLevel.Administrator);
		expect(getRequiredCommandPermissionLevel(new Extended())).toBe(CommandPermissionLevel.Administrator);
	});

	test('GIVEN a chatInputRun with no level, or one that replaces a decorated one THEN it requires none', () => {
		class Everyone {
			public chatInputRun() {
				return null;
			}
		}
		class Administrators {
			public chatInputRun() {
				return null;
			}
		}
		decorate(Administrators.prototype, 'chatInputRun', CommandPermissionLevel.Administrator);
		class Replaced extends Administrators {
			public override chatInputRun() {
				return null;
			}
		}

		expect(getRequiredCommandPermissionLevel(new Everyone())).toBeNull();
		expect(getRequiredCommandPermissionLevel(new Replaced())).toBeNull();
	});

	test('GIVEN the level of another method THEN it is not the one of the chat input method', () => {
		class Autocomplete {
			public autocompleteRun() {
				return null;
			}
		}
		decorate(Autocomplete.prototype, 'autocompleteRun', CommandPermissionLevel.Moderator);

		expect(getRequiredCommandPermissionLevel(new Autocomplete())).toBeNull();
	});
});

describe('hasCommandPermissionLevel', () => {
	const guildId = '254360814063058944';
	const moderatorRoleId = '254360814063058950';
	let gatewayClient: unknown;

	function member(permissions: bigint, roles: string[] = []) {
		return { user: { id: '266624760782258186' }, roles, permissions: permissions.toString() } as never;
	}

	function settings(rolesModerator: string[] = []) {
		vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guildId, rolesModerator } as ReadonlyGuildData);
	}

	beforeEach(() => {
		gatewayClient = container.gatewayClient;
		container.gatewayClient = { guilds: { fetch: vi.fn(async () => ({ id: guildId, ownerId: '242043489611808769' })) } } as never;
		settings();
	});

	afterEach(() => {
		container.gatewayClient = gatewayClient as never;
	});

	test('GIVEN no moderator roles and no fallback THEN everybody passes, Discord having checked the command', async () => {
		await expect(hasCommandPermissionLevel({ guildId, member: member(0n) }, CommandPermissionLevel.Moderator)).resolves.toBe(true);
	});

	test('GIVEN no moderator roles and a fallback THEN only the members with that permission, or administrators, pass', async () => {
		const level = CommandPermissionLevel.Moderator;
		const fallback = PermissionFlagsBits.ModerateMembers;

		await expect(hasCommandPermissionLevel({ guildId, member: member(0n) }, level, fallback)).resolves.toBe(false);
		await expect(hasCommandPermissionLevel({ guildId, member: member(fallback) }, level, fallback)).resolves.toBe(true);
		await expect(hasCommandPermissionLevel({ guildId, member: member(PermissionFlagsBits.ManageGuild) }, level, fallback)).resolves.toBe(true);
	});

	test('GIVEN moderator roles THEN a role is required, whatever the fallback', async () => {
		settings([moderatorRoleId]);
		const fallback = PermissionFlagsBits.ModerateMembers;

		await expect(hasCommandPermissionLevel({ guildId, member: member(fallback) }, CommandPermissionLevel.Moderator, fallback)).resolves.toBe(
			false
		);
		await expect(
			hasCommandPermissionLevel({ guildId, member: member(0n, [moderatorRoleId]) }, CommandPermissionLevel.Moderator, fallback)
		).resolves.toBe(true);
	});
});
