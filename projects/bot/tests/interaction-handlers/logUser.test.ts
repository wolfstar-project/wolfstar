import { UserInteractionHandler } from '#root/interaction-handlers/logUser';
import { MessageFlags } from 'discord-api-types/v10';

const userId = '266624760782258186';

describe('the Get User ID button of a log', () => {
	// The handler is run on its prototype, it reads nothing of the piece:
	const handler = Object.create(UserInteractionHandler.prototype) as UserInteractionHandler;
	const reply = vi.fn(async () => undefined);
	const interaction = { reply } as never;

	beforeEach(() => reply.mockClear());

	test('GIVEN the button THEN it answers who clicked with the ID, as plain text only they see', async () => {
		await handler.run(interaction, [userId, 'id']);

		expect(reply).toHaveBeenCalledWith({ content: userId, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	});

	test('GIVEN a custom ID that is not the button of a log THEN it says it expired', async () => {
		await handler.run(interaction, ['not-an-id', 'id']);

		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral, content: expect.stringContaining('expired') }));
	});
});
