import { UserCommand as BlockCommand } from '#root/commands/Moderation/appeal/block';
import { UserCommand as UnblockCommand } from '#root/commands/Moderation/appeal/unblock';
import { container } from '@wolfstar/http-framework';
import { MessageFlags } from 'discord-api-types/v10';
import { createAppealBlock, deleteAppealBlock } from 'wolfstar-database';

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	createAppealBlock: vi.fn(),
	deleteAppealBlock: vi.fn()
}));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: vi.fn(() => (key: string) => key)
}));

const guildId = '254360814063058944';
const moderatorId = '242043489611808769';
const userId = '266624760782258186';

describe('/appeal block and /appeal unblock', () => {
	const reply = vi.fn();
	const interaction = { guildId, user: { id: moderatorId }, reply } as never;
	const user = { user: { id: userId } };

	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(container, { prisma: {} });
	});

	test('GIVEN a user THEN they are blocked by hand, in the name of the moderator', async () => {
		vi.mocked(createAppealBlock).mockResolvedValue(true);

		await BlockCommand.prototype.chatInputRun.call({} as never, interaction, { user, reason: 'Spam' } as never);

		expect(createAppealBlock).toHaveBeenCalledWith(container.prisma, guildId, { userId, reason: 'Spam', moderatorId, automatic: false });
		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'commands/appeal:blocked', flags: MessageFlags.Ephemeral }));
	});

	test('GIVEN a user who is blocked already THEN it says so', async () => {
		vi.mocked(createAppealBlock).mockResolvedValue(false);

		await BlockCommand.prototype.chatInputRun.call({} as never, interaction, { user } as never);

		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'commands/appeal:blockedAlready' }));
	});

	test.each([
		[true, 'commands/appeal:unblocked'],
		[false, 'commands/appeal:unblockedAlready']
	])('GIVEN unblocking with a block there being %s THEN it says %s', async (removed, content) => {
		vi.mocked(deleteAppealBlock).mockResolvedValue(removed);

		await UnblockCommand.prototype.chatInputRun.call({} as never, interaction, { user } as never);

		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content }));
	});
});
