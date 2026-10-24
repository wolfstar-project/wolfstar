import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { UserPrecondition as Administrator } from '#root/preconditions/administrator';
import { UserPrecondition as Moderator } from '#root/preconditions/moderator';
import type { InteractionHandler } from '@wolfstar/http-framework';

vi.mock('#lib/structures/commands/permissions', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/structures/commands/permissions')>()),
	hasCommandPermissionLevel: vi.fn()
}));

// The checks only read the name of the piece, so it is given the least a piece is built with:
function create<Piece extends object>(Piece_: new (context: never, options: never) => Piece, name: string): Piece {
	return new Piece_({ name, path: `/preconditions/${name}.ts`, root: '/', store: { name: 'preconditions' } } as never, {} as never);
}

const member = { user: { id: '1' }, roles: [], permissions: '0' };

describe('permission level preconditions', () => {
	const administrator = create(Administrator, 'administrator');
	const moderator = create(Moderator, 'moderator');

	beforeEach(() => vi.mocked(hasCommandPermissionLevel).mockReset());

	test('GIVEN a member of the level THEN every kind of interaction passes, and the level is the one of the piece', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);
		const interaction = { guildId: '2', member, data: { name: 'automod' } } as never;

		expect((await administrator.chatInputRun(interaction)).isOk()).toBe(true);
		expect((await administrator.contextMenuRun(interaction)).isOk()).toBe(true);
		expect((await administrator.autocompleteRun(interaction)).isOk()).toBe(true);
		expect((await moderator.interactionHandlerRun(interaction, { name: 'automod' } as InteractionHandler)).isOk()).toBe(true);

		expect(vi.mocked(hasCommandPermissionLevel).mock.calls.map(([, level]) => level)).toEqual([
			CommandPermissionLevel.Administrator,
			CommandPermissionLevel.Administrator,
			CommandPermissionLevel.Administrator,
			CommandPermissionLevel.Moderator
		]);
	});

	test('GIVEN a member who is not of the level THEN the command is denied with the message of the level', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);
		const interaction = { guildId: '2', member, data: { name: 'automod' } } as never;

		const denied = (await administrator.chatInputRun(interaction)).unwrapErr();
		expect(denied).toMatchObject({ identifier: 'preconditions:administrator', context: { command: { name: 'automod' } } });
		expect((await moderator.chatInputRun(interaction)).unwrapErr()).toMatchObject({ identifier: 'preconditions:moderator' });
	});

	test('GIVEN a handler THEN the message names the handler', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);
		const interaction = { guildId: '2', member } as never;

		const denied = (await administrator.interactionHandlerRun(interaction, { name: 'automod' } as InteractionHandler)).unwrapErr();
		expect(denied).toMatchObject({ context: { command: { name: 'automod' } } });
	});

	test('GIVEN an interaction that is not from a guild THEN it is denied without asking for the level', async () => {
		const interaction = { guildId: null, member: undefined, data: { name: 'automod' } } as never;

		expect((await administrator.chatInputRun(interaction)).isErr()).toBe(true);
		expect(hasCommandPermissionLevel).not.toHaveBeenCalled();
	});
});
