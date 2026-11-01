import { sendAppealDirectMessage } from '#lib/moderation/appealService';
import { UserCommand } from '#root/commands/Moderation/appeal/send';
import { container } from '@wolfstar/http-framework';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchAppealByMessage } from 'wolfstar-database';

vi.mock('#lib/moderation/appealService', () => ({ sendAppealDirectMessage: vi.fn() }));
vi.mock('#lib/moderation/common/util', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/common/util')>()),
	fetchGuildT: vi.fn(async () => (key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`)
}));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchAppealByMessage: vi.fn()
}));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: vi.fn(() => (key: string) => key)
}));

const guildId = '254360814063058944';
const threadId = '254360814063058946';
const moderatorId = '242043489611808769';

describe('/appeal send', () => {
	const reply = vi.fn();
	const update = vi.fn();
	const defer = vi.fn(async () => ({ update }));
	const appeal = { id: '1', caseId: 12, userId: '266624760782258186' };
	const guild = { id: guildId };

	function run(message = 'Tell us more') {
		const command = Object.create(UserCommand.prototype) as UserCommand;
		const interaction = { guildId, channelId: threadId, user: { id: moderatorId }, reply, defer };
		return command.chatInputRun(interaction as never, { message });
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchAppealByMessage).mockResolvedValue(appeal as never);
		vi.mocked(sendAppealDirectMessage).mockResolvedValue(true);
		Object.assign(container, { prisma: {}, gatewayClient: { guilds: { fetch: vi.fn(async () => guild) } } });
	});

	test('GIVEN a channel that is not the thread of an appeal THEN nobody is written to', async () => {
		vi.mocked(fetchAppealByMessage).mockResolvedValue(null);

		await run();

		expect(reply).toHaveBeenCalledWith({ content: 'commands/appeal:sendNotThread', flags: MessageFlags.Ephemeral });
		expect(defer).not.toHaveBeenCalled();
		expect(sendAppealDirectMessage).not.toHaveBeenCalled();
	});

	test('GIVEN the thread of an appeal THEN the answer is deferred first, reaching the member being slower than Discord waits', async () => {
		await run();

		expect(defer.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendAppealDirectMessage).mock.invocationCallOrder[0]);
	});

	test('GIVEN the thread of an appeal THEN the appeal is the one of the thread', async () => {
		await run('Tell us more');

		expect(fetchAppealByMessage).toHaveBeenCalledWith(container.prisma, guildId, threadId);
		expect(sendAppealDirectMessage).toHaveBeenCalledWith(guild, appeal, 'Tell us more');
	});

	test('GIVEN a message that reached the member THEN it stays in the thread with who wrote it, and pings nobody', async () => {
		await run('Tell us more @everyone');

		const [answer] = update.mock.calls[0] as [{ content: string; allowed_mentions: unknown }];
		expect(defer).toHaveBeenCalledWith();
		expect(answer.content).toContain('Tell us more @everyone');
		expect(answer.content).toContain(`<@${moderatorId}>`);
		expect(answer.allowed_mentions).toEqual({ parse: [] });
	});

	test('GIVEN a message that did not reach the member THEN the thread says so, without showing it as sent', async () => {
		vi.mocked(sendAppealDirectMessage).mockResolvedValue(false);

		await run('Tell us more');

		const [answer] = update.mock.calls[0] as [{ content: string }];
		expect(answer.content).toContain('commands/appeal:sendFailed');
		expect(answer.content).not.toContain('Tell us more');
	});
});
