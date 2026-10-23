import { readSettings } from '#lib/database';
import { createCommand, guild } from '#mocks/MockInstances';
import { UserPrecondition as CommandsEnabled } from '#root/preconditions/commandsEnabled';
import type { Command } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
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
});
