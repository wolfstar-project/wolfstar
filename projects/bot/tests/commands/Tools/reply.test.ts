import { UserCommand } from '#root/commands/Tools/reply';
import { container } from '@wolfstar/http-framework';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchPendingAppeals } from 'wolfstar-database';

vi.mock('#lib/moderation/common/util', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/common/util')>()),
	fetchGuildT: vi.fn(async () => (key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`)
}));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchPendingAppeals: vi.fn()
}));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: vi.fn(() => (key: string) => key)
}));

const userId = '266624760782258186';
const appeal = (guildId: string, caseId: number) => ({ id: String(caseId), guildId, caseId, userId, threadId: `${guildId}9` });

describe('/reply', () => {
	const reply = vi.fn();
	const update = vi.fn();
	const defer = vi.fn(async () => ({ update }));
	const createMessage = vi.fn(async () => ({}));
	const fetchGuild = vi.fn(async (id: string) => ({ id, name: `Server ${id}` }));

	function run(options: { message?: string; appeal?: string } = {}) {
		const interaction = { user: { id: userId }, reply, defer };
		return UserCommand.prototype.chatInputRun.call({} as never, interaction as never, { message: 'Hello', ...options } as never);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchPendingAppeals).mockResolvedValue([appeal('1', 12)] as never);
		Object.assign(container, { prisma: {}, gatewayClient: { guilds: { fetch: fetchGuild }, api: { channels: { createMessage } } } });
	});

	test('GIVEN no pending appeal THEN the member is told, and nothing is posted', async () => {
		vi.mocked(fetchPendingAppeals).mockResolvedValue([]);

		await run();

		expect(reply).toHaveBeenCalledWith({ content: 'commands/reply:none', flags: MessageFlags.Ephemeral });
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a pending appeal with no thread THEN the member is told there is nowhere to answer, not that they have no appeal', async () => {
		vi.mocked(fetchPendingAppeals).mockResolvedValue([{ ...appeal('1', 12), threadId: null }] as never);

		await run();

		expect(reply).toHaveBeenCalledWith({ content: 'commands/reply:noThread', flags: MessageFlags.Ephemeral });
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN one pending appeal THEN it goes to its thread without asking, and pings nobody', async () => {
		await run({ message: 'Hello @everyone' });

		expect(createMessage).toHaveBeenCalledWith('19', { content: expect.stringContaining('Hello @everyone'), allowed_mentions: { parse: [] } });
		expect(update).toHaveBeenCalledWith({ content: 'commands/reply:sent' });
	});

	test('GIVEN several pending appeals and no option THEN it asks which, and nothing is posted', async () => {
		vi.mocked(fetchPendingAppeals).mockResolvedValue([appeal('1', 12), appeal('2', 3)] as never);

		await run();

		expect(reply).toHaveBeenCalledWith({ content: 'commands/reply:choose', flags: MessageFlags.Ephemeral });
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN several pending appeals and the option THEN it goes to that one', async () => {
		vi.mocked(fetchPendingAppeals).mockResolvedValue([appeal('1', 12), appeal('2', 3)] as never);

		await run({ appeal: '2:3' });

		expect(createMessage).toHaveBeenCalledWith('29', expect.anything());
	});

	test('GIVEN the option of an appeal that is not theirs THEN it is refused', async () => {
		await run({ appeal: '7:7' });

		expect(reply).toHaveBeenCalledWith({ content: 'commands/reply:notFound', flags: MessageFlags.Ephemeral });
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN a thread that is gone THEN the member is told, and nothing throws', async () => {
		createMessage.mockRejectedValueOnce(new Error('Unknown Channel'));

		await run();

		expect(update).toHaveBeenCalledWith({ content: 'commands/reply:failed' });
	});

	test('GIVEN a server the bot left THEN the member is told, and nothing throws', async () => {
		fetchGuild.mockRejectedValueOnce(new Error('Unknown Guild'));

		await run();

		expect(update).toHaveBeenCalledWith({ content: 'commands/reply:failed' });
		expect(createMessage).not.toHaveBeenCalled();
	});

	test('GIVEN the autocomplete THEN it offers the appeals of the user, by their server', async () => {
		const respond = vi.fn();
		vi.mocked(fetchPendingAppeals).mockResolvedValue([appeal('1', 12), appeal('2', 3)] as never);

		await UserCommand.prototype.autocompleteRun.call(
			{} as never,
			{ user: { id: userId }, reply: respond } as never,
			{ focused: 'appeal' } as never
		);

		expect(respond).toHaveBeenCalledWith({
			choices: [
				{ name: 'Server 1 · #12', value: '1:12' },
				{ name: 'Server 2 · #3', value: '2:3' }
			]
		});
	});
});
