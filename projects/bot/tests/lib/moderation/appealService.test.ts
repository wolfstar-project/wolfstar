import { readSettings } from '#lib/database/settings/functions';
import { renderAppealView, sendAppealDirectMessage, settleAppeal, submitAppeal } from '#lib/moderation/appealService';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import { createAppeal, decideAppeal, setAppealMessage, type Appeal } from 'wolfstar-database';

vi.mock('#lib/database/settings/functions', () => ({ readSettings: vi.fn() }));
vi.mock('#lib/moderation/actions', () => ({ ModerationActions: { ban: { undo: vi.fn() } } }));
vi.mock('#lib/moderation/common/util', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/common/util')>()),
	fetchGuildT: vi.fn(async () => (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key))
}));
vi.mock('#utils/functions', () => ({ getModeration: vi.fn() }));
vi.mock('@wolfstar/http-framework-utilities/gateway', () => ({ canSendEmbeds: vi.fn(async () => true) }));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	createAppeal: vi.fn(),
	decideAppeal: vi.fn(),
	fetchUserAppeals: vi.fn(),
	reopenAppeal: vi.fn(),
	setAppealMessage: vi.fn()
}));

const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const messageId = '254360814063058946';
const userId = '266624760782258186';
const moderatorId = '242043489611808769';
const guild = { id: guildId, name: 'The Lab' } as never;

function createRow(overrides: Partial<Appeal> = {}): Appeal {
	return {
		id: '1',
		guildId,
		caseId: 12,
		userId,
		answers: ['Sorry'],
		status: 'pending',
		reviewerId: null,
		reason: null,
		channelId: null,
		messageId: null,
		createdAt: Date.UTC(2026, 0, 1),
		...overrides
	};
}

function createEntry(type = TypeVariation.Ban, overrides: Record<string, unknown> = {}) {
	return {
		id: 12,
		type,
		userId,
		reason: 'Spam',
		isUndo: () => false,
		isTemporary: () => false,
		isCompleted: () => false,
		isArchived: () => false,
		...overrides
	} as never;
}

describe('the appeals', () => {
	const send = vi.fn();
	const fetchUser = vi.fn();
	const fetchCase = vi.fn();
	const createThread = vi.fn(async () => ({}));
	const channelSend = vi.fn(async () => ({ id: messageId }));
	const channel = { guildId, send: channelSend };

	beforeEach(() => {
		vi.clearAllMocks();
		fetchUser.mockResolvedValue({ send });
		send.mockResolvedValue({ id: '1' });
		fetchCase.mockResolvedValue(createEntry());
		vi.mocked(getModeration).mockResolvedValue({ fetch: fetchCase } as never);
		vi.mocked(decideAppeal).mockResolvedValue(true);
		vi.mocked(createAppeal).mockResolvedValue(createRow());
		vi.mocked(readSettings).mockResolvedValue({
			appealsEnabled: true,
			appealsBans: true,
			appealsMutes: true,
			appealsTimeouts: true,
			appealsChannel: channelId,
			appealsQuestions: []
		} as never);
		Object.assign(container, {
			prisma: {},
			gatewayClient: { users: { fetch: fetchUser }, channels: { fetch: vi.fn(async () => channel) }, api: { channels: { createThread } } }
		});
	});

	describe('submitAppeal', () => {
		beforeEach(() => {
			fetchCase.mockResolvedValue(new Map([[12, createEntry()]]));
		});

		test('GIVEN an appeal THEN its message is remembered and a thread starts on it, which is how /appeal send finds it', async () => {
			await submitAppeal(guild, userId, 12, ['Sorry']);

			expect(setAppealMessage).toHaveBeenCalledWith(container.prisma, guildId, '1', channelId, messageId);
			expect(createThread).toHaveBeenCalledWith(
				channelId,
				expect.objectContaining({ name: expect.stringContaining('appealThreadName') }),
				messageId
			);
		});

		test('GIVEN a thread that cannot start THEN the appeal is made and sent all the same', async () => {
			const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);
			createThread.mockRejectedValueOnce(new Error('Missing Permissions'));

			const result = await submitAppeal(guild, userId, 12, ['Sorry']);

			expect(result).toEqual({ appeal: createRow() });
			expect(setAppealMessage).toHaveBeenCalledOnce();
			expect(warn).toHaveBeenCalledOnce();
		});

		test('GIVEN no channel of the appeals THEN no message is remembered and no thread starts', async () => {
			vi.mocked(readSettings).mockResolvedValue({
				appealsEnabled: true,
				appealsBans: true,
				appealsChannel: null,
				appealsQuestions: []
			} as never);

			await submitAppeal(guild, userId, 12, ['Sorry']);

			expect(setAppealMessage).not.toHaveBeenCalled();
			expect(createThread).not.toHaveBeenCalled();
		});
	});

	describe('settleAppeal', () => {
		test('GIVEN a case that is gone THEN the appeal is not decided', async () => {
			fetchCase.mockResolvedValue(null);

			expect(await settleAppeal(guild, createRow(), true, moderatorId, null)).toEqual({ error: 'caseGone' });
			expect(decideAppeal).not.toHaveBeenCalled();
		});

		test('GIVEN a case of a type that cannot be appealed THEN the appeal is not decided', async () => {
			fetchCase.mockResolvedValue(createEntry(TypeVariation.Warning));

			expect(await settleAppeal(guild, createRow(), true, moderatorId, null)).toEqual({ error: 'caseGone' });
			expect(decideAppeal).not.toHaveBeenCalled();
		});

		test('GIVEN an appeal another moderator decided THEN it says so', async () => {
			vi.mocked(decideAppeal).mockResolvedValue(false);

			expect(await settleAppeal(guild, createRow(), false, moderatorId, null)).toEqual({ error: 'decided' });
		});

		test('GIVEN a decision THEN its message has no buttons any more and tells it', async () => {
			const result = await settleAppeal(guild, createRow(), false, moderatorId, 'No');

			expect(result).toMatchObject({ message: { components: [], embeds: [{ footer: { text: expect.stringContaining('appealDenied') } }] } });
		});
	});

	describe('sendAppealDirectMessage', () => {
		test('GIVEN a member who takes direct messages THEN it reaches them and pings nobody', async () => {
			expect(await sendAppealDirectMessage(guild, createRow(), 'Tell us more')).toBe(true);
			expect(send).toHaveBeenCalledWith({ content: expect.stringContaining('Tell us more'), allowed_mentions: { parse: [] } });
		});

		test('GIVEN a member who does not take them THEN it says so', async () => {
			send.mockRejectedValue(new Error('Cannot send messages to this user'));

			expect(await sendAppealDirectMessage(guild, createRow(), 'Tell us more')).toBe(false);
		});

		test('GIVEN a user that cannot be found THEN it says so', async () => {
			fetchUser.mockRejectedValue(new Error('Unknown User'));

			expect(await sendAppealDirectMessage(guild, createRow(), 'Tell us more')).toBe(false);
		});
	});

	describe('renderAppealView', () => {
		test('GIVEN a pending appeal THEN it has no buttons to decide it: they stay on its message', () => {
			const view = renderAppealView(t, createRow(), createEntry(), ['Why?']);

			expect(view.components).toEqual([]);
			expect(view.embeds[0].fields).toEqual([{ name: 'Why?', value: 'Sorry' }]);
		});

		test('GIVEN a decided appeal THEN it tells what was decided and by whom', () => {
			const appeal = createRow({ status: 'denied', reviewerId: moderatorId, reason: 'No' });
			const [embed] = renderAppealView(t, appeal, createEntry(), ['Why?']).embeds;

			expect(embed.footer?.text).toContain('appealDenied');
			expect(embed.fields?.at(-1)?.value).toBe(`<@${moderatorId}>`);
		});

		test('GIVEN an appeal that was sent THEN it links to its message', () => {
			const { components } = renderAppealView(t, createRow({ channelId, messageId }), createEntry(), []);

			expect(components[0].components[0]).toMatchObject({ url: `https://discord.com/channels/${guildId}/${channelId}/${messageId}` });
		});
	});
});
