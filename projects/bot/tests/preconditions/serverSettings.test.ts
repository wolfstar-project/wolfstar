import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { UserPrecondition } from '#root/preconditions/serverSettings';
import type { InteractionHandler } from '@wolfstar/http-framework';

vi.mock('#lib/structures/commands/permissions', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/structures/commands/permissions')>()),
	canManageServerSettingsFrom: vi.fn()
}));

// The check only reads the name of the piece, so it is given the least a piece is built with:
const precondition = new UserPrecondition(
	{ name: 'serverSettings', path: '/preconditions/serverSettings.ts', root: '/', store: { name: 'preconditions' } } as never,
	{} as never
);
const member = { user: { id: '1' }, roles: [], permissions: '0' };
const handler = { name: 'settingsImport' } as InteractionHandler;

describe('serverSettings precondition', () => {
	beforeEach(() => vi.mocked(canManageServerSettingsFrom).mockReset());

	test('GIVEN a member who may manage the settings THEN they pass', async () => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(true);

		expect((await precondition.interactionHandlerRun({ guildId: '2', member } as never, handler)).isOk()).toBe(true);
		expect(canManageServerSettingsFrom).toHaveBeenCalledWith({ guildId: '2', member });
	});

	test('GIVEN a member who may not THEN they get the denial of the administrator level, naming the handler', async () => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(false);

		const denied = (await precondition.interactionHandlerRun({ guildId: '2', member } as never, handler)).unwrapErr();
		expect(denied).toMatchObject({ identifier: 'preconditions:administrator', context: { command: { name: 'settingsImport' } } });
	});

	test('GIVEN an interaction that is not from a guild THEN it is denied without asking', async () => {
		const result = await precondition.chatInputRun({ guildId: null, member: undefined, data: { name: 'settings' } } as never);

		expect(result.isErr()).toBe(true);
		expect(canManageServerSettingsFrom).not.toHaveBeenCalled();
	});
});
