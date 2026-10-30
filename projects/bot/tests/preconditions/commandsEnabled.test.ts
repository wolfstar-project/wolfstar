import { readSettings } from '#lib/database';
import { createCommand, guild } from '#mocks/MockInstances';
import { UserPrecondition as CommandsEnabled } from '#root/preconditions/commandsEnabled';
import { container, type Command } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
vi.mock('#lib/structures/commands/permissions', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/structures/commands/permissions')>()),
	hasCommandPermissionLevel: vi.fn().mockResolvedValue(false)
}));

// The precondition is run directly, so it is given the least a piece is built with:
const precondition = new CommandsEnabled(
	{ name: 'commandsEnabled', path: '/preconditions/commandsEnabled.ts', root: '/', store: { name: 'preconditions' } } as never,
	{} as never
);

// `/case`, `/prune`, `/lockdown`, `/slowmode`, `/dehoist` and `/archive` do not extend `ModerationCommand`, which asks
// for the module again, so this is the only check they have; `/ban` does. Each is in its directory of `src/commands`:
// `/report` is in the one of the moderation, but it is of the reports.
const moderationCommands = [
	createCommand('case', 'Moderation', 'Utilities'),
	createCommand('prune', 'Moderation'),
	createCommand('lockdown', 'Moderation'),
	createCommand('slowmode', 'Moderation', 'Utilities'),
	createCommand('dehoist', 'Moderation'),
	createCommand('archive', 'Moderation'),
	createCommand('ban', 'Moderation')
];
const otherCommands = [createCommand('reasons', 'Management'), createCommand('report', 'Moderation'), createCommand('settings', 'Management')];

const interaction = { guildId: guild.id, member: { user: { id: '1' }, roles: [], permissions: '0' }, channel: { id: '2' } } as never;

function mockSettings(modulesModeration: boolean) {
	vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guild.id, modulesModeration } as ReadonlyGuildData);
}

// What the precondition answers for each command: `null` when it lets it run, the identifier of the denial otherwise.
async function check(commands: readonly Command[]) {
	const answers: Record<string, string | null> = {};
	for (const command of commands) {
		const result = await precondition.chatInputRun(interaction, command);
		answers[command.name] = result.isOk() ? null : result.unwrapErr().identifier;
	}

	return answers;
}

describe('commandsEnabled precondition', () => {
	beforeEach(() => vi.mocked(readSettings).mockReset());

	test('GIVEN modules.moderation off THEN the commands of the module are denied with preconditions:disabledModuleModeration, and /reasons, /report and /settings are not', async () => {
		mockSettings(false);

		expect(await check(moderationCommands)).toEqual({
			case: 'preconditions:disabledModuleModeration',
			prune: 'preconditions:disabledModuleModeration',
			lockdown: 'preconditions:disabledModuleModeration',
			slowmode: 'preconditions:disabledModuleModeration',
			dehoist: 'preconditions:disabledModuleModeration',
			archive: 'preconditions:disabledModuleModeration',
			ban: 'preconditions:disabledModuleModeration'
		});
		expect(await check(otherCommands)).toEqual({ reasons: null, report: null, settings: null });
	});

	test('GIVEN modules.moderation on THEN the commands of the module run', async () => {
		mockSettings(true);

		expect(await check(moderationCommands)).toEqual(Object.fromEntries(moderationCommands.map((command) => [command.name, null])));
	});

	test('GIVEN a rule on the category of a command THEN it applies to the command, and a rule on another category does not', async () => {
		const ban = moderationCommands.at(-1)!;
		const userId = '266624760782258186';
		const member = { guildId: guild.id, member: { user: { id: userId }, roles: [], permissions: '0' }, channel: { id: '2' } } as never;
		const rules = (command: string) => [{ command, ignoredUsers: [userId] }, { format: 2 }];

		vi.mocked(readSettings).mockResolvedValue({
			...getDefaultGuildSettings()!,
			id: guild.id,
			commandsRestrictions: rules('Moderation.*')
		} as never);
		expect((await precondition.chatInputRun(member, ban)).unwrapErr()).toMatchObject({ identifier: 'preconditions:restrictedUser' });

		vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guild.id, commandsRestrictions: rules('Tools.*') } as never);
		expect((await precondition.chatInputRun(member, ban)).isOk()).toBe(true);
	});

	describe('the order of the roles of a member', () => {
		const original = container.gatewayClient;
		const high = { id: '541739191776575502', position: 27 };
		const low = { id: '541743369081192451', position: 11 };
		const userId = '266624760782258186';
		const cache = new Map<string, unknown>();
		const fetchAll = vi.fn();
		const use = {
			guildId: guild.id,
			member: { user: { id: userId }, roles: [high.id, low.id], permissions: '0' },
			channel: { id: '2' }
		} as never;
		const mockRules = (rule: Record<string, unknown>) =>
			vi.mocked(readSettings).mockResolvedValue({
				...getDefaultGuildSettings()!,
				id: guild.id,
				commandsRestrictions: [{ command: 'ban', ...rule }, { format: 2 }]
			} as never);

		beforeEach(() => {
			cache.clear();
			fetchAll.mockReset();
			container.gatewayClient = {
				roles: { cache: { get: async (key: string) => cache.get(key) }, resolveKey: (_: string, id: string) => id, fetchAll }
			} as never;
		});

		afterEach(() => {
			container.gatewayClient = original;
		});

		test('GIVEN one of their roles named by a rule THEN no role is read', async () => {
			mockRules({ allowedRoles: [high.id], ignoredRoles: [guild.id] });

			expect((await precondition.chatInputRun(use, moderationCommands.at(-1)!)).isOk()).toBe(true);
			expect(fetchAll).not.toHaveBeenCalled();
		});

		test('GIVEN two of their roles named by a rule THEN the cache orders them, without a request', async () => {
			cache.set(high.id, high).set(low.id, low);
			mockRules({ allowedRoles: [low.id], ignoredRoles: [high.id] });

			expect((await precondition.chatInputRun(use, moderationCommands.at(-1)!)).isErr()).toBe(true);
			expect(fetchAll).not.toHaveBeenCalled();
		});

		test('GIVEN a role the cache does not have THEN they are fetched', async () => {
			cache.set(high.id, high);
			fetchAll.mockResolvedValue([high, low]);
			mockRules({ allowedRoles: [high.id], ignoredRoles: [low.id] });

			expect((await precondition.chatInputRun(use, moderationCommands.at(-1)!)).isOk()).toBe(true);
			expect(fetchAll).toHaveBeenCalledOnce();
		});
	});
});
