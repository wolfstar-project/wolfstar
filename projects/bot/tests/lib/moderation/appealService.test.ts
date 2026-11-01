import { readSettings } from '#lib/database/settings/functions';
import { getAppealPage, renderAppealView, sendAppealDirectMessage, settleAppeal, submitAppeal } from '#lib/moderation/appealService';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import { ChannelType } from 'discord-api-types/v10';
import { ModerationActions } from '#lib/moderation/actions';
import {
	createAppeal,
	createAppealBlock,
	decideAppeal,
	fetchAppeal,
	fetchAppealBlock,
	fetchAppealForm,
	fetchAppealForms,
	fetchUserAppeals,
	setAppealMessage,
	setAppealThread,
	type Appeal,
	type AppealForm
} from 'wolfstar-database';

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
	createAppealBlock: vi.fn(),
	decideAppeal: vi.fn(),
	fetchAppeal: vi.fn(),
	fetchAppealBlock: vi.fn(),
	fetchAppealForm: vi.fn(),
	fetchAppealForms: vi.fn(),
	fetchUserAppeals: vi.fn(),
	reopenAppeal: vi.fn(),
	setAppealMessage: vi.fn(),
	setAppealThread: vi.fn()
}));

const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const messageId = '254360814063058946';
const threadId = '254360814063058947';
const userId = '266624760782258186';
const moderatorId = '242043489611808769';
const guild = { id: guildId, name: 'The Lab', iconURL: () => null } as never;

function createForm(overrides: Partial<AppealForm> = {}): AppealForm {
	return {
		id: '5',
		guildId,
		name: 'Bans',
		description: null,
		icon: null,
		enabled: true,
		lockReason: null,
		types: [],
		requiredRoles: [],
		restrictedRoles: [],
		questions: [{ id: 'why', kind: 'text', label: 'Why?', long: true, maxLength: 100, required: true }],
		position: 0,
		...overrides
	};
}

function createRow(overrides: Partial<Appeal> = {}): Appeal {
	return {
		id: '1',
		guildId,
		caseId: 12,
		userId,
		formId: null,
		answers: [{ questionId: 'why', kind: 'text', label: 'Why?', value: 'Sorry' }],
		status: 'pending',
		reviewerId: null,
		reason: null,
		channelId: null,
		messageId: null,
		threadId: null,
		decidedAt: null,
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
	const fetchMember = vi.fn();
	const fetchCase = vi.fn();
	const createThread = vi.fn(async () => ({ id: threadId }));
	const createMessage = vi.fn(async () => ({}));
	const editChannel = vi.fn(async () => ({}));
	const editMessage = vi.fn(async () => ({}));
	const channelSend = vi.fn(async () => ({ id: messageId }));
	const channel = { guildId, type: ChannelType.GuildText, send: channelSend };

	const baseSettings = {
		appealsEnabled: true,
		appealsBans: true,
		appealsMutes: true,
		appealsTimeouts: true,
		appealsChannel: channelId,
		appealsCooldownDays: 7,
		appealsMaxActive: 1,
		appealsAnonymous: false,
		appealsThread: 'public',
		appealsPingRoles: [] as string[],
		appealsManagerRoles: [] as string[],
		appealsBlockOnDenial: false
	};
	const useSettings = (overrides: Partial<typeof baseSettings>) =>
		vi.mocked(readSettings).mockResolvedValue({ ...baseSettings, ...overrides } as never);

	beforeEach(() => {
		vi.clearAllMocks();
		channel.type = ChannelType.GuildText;
		fetchUser.mockResolvedValue({ send });
		send.mockResolvedValue({ id: '1' });
		fetchCase.mockResolvedValue(createEntry());
		vi.mocked(getModeration).mockResolvedValue({ fetch: fetchCase } as never);
		vi.mocked(decideAppeal).mockResolvedValue(true);
		vi.mocked(createAppeal).mockResolvedValue(createRow());
		vi.mocked(createAppealBlock).mockResolvedValue(true);
		vi.mocked(fetchAppealBlock).mockResolvedValue(null);
		vi.mocked(fetchAppealForms).mockResolvedValue([]);
		vi.mocked(fetchAppealForm).mockResolvedValue(null);
		vi.mocked(fetchUserAppeals).mockResolvedValue([]);
		fetchMember.mockRejectedValue(new Error('Unknown Member'));
		useSettings({});
		Object.assign(container, {
			prisma: {},
			gatewayClient: {
				users: { fetch: fetchUser },
				members: { fetch: fetchMember },
				channels: { fetch: vi.fn(async () => channel) },
				api: { channels: { createThread, createMessage, editMessage, edit: editChannel } }
			}
		});
	});

	describe('submitAppeal', () => {
		beforeEach(() => {
			fetchCase.mockResolvedValue(new Map([[12, createEntry()]]));
			vi.mocked(fetchAppeal).mockResolvedValue(createRow());
		});

		test('GIVEN an appeal THEN its message is remembered and a thread starts on it, which is how /appeal send finds it', async () => {
			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(setAppealMessage).toHaveBeenCalledWith(container.prisma, guildId, '1', channelId, messageId);
			expect(createThread).toHaveBeenCalledWith(
				channelId,
				expect.objectContaining({ name: expect.stringContaining('appealThreadName') }),
				messageId
			);
		});

		test.each([
			['public', messageId],
			['private', undefined]
		])('GIVEN %s threads THEN the thread is remembered by its own ID', async (appealsThread, starter) => {
			useSettings({ appealsThread, appealsPingRoles: ['7'] });

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createThread).toHaveBeenCalledWith(channelId, expect.anything(), starter);
			expect(setAppealThread).toHaveBeenCalledWith(container.prisma, guildId, '1', threadId);
		});

		test('GIVEN no threads THEN none starts', async () => {
			useSettings({ appealsThread: 'none' });

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createThread).not.toHaveBeenCalled();
		});

		test('GIVEN a private thread THEN it links to the appeal and brings the ping roles in', async () => {
			useSettings({ appealsThread: 'private', appealsPingRoles: ['7'] });

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createThread).toHaveBeenCalledWith(channelId, expect.objectContaining({ type: ChannelType.PrivateThread }), undefined);
			expect(createMessage).toHaveBeenCalledWith(threadId, {
				content: expect.stringContaining(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`),
				allowed_mentions: { roles: ['7'] }
			});
			expect(vi.mocked(createMessage).mock.calls[0]).toMatchObject([threadId, { content: expect.stringContaining('<@&7>') }]);
		});

		test('GIVEN a private thread THEN the manager roles are brought in too, and only the ping roles were mentioned in the channel', async () => {
			useSettings({ appealsThread: 'private', appealsPingRoles: ['7'], appealsManagerRoles: ['8'] });

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createMessage).toHaveBeenCalledWith(threadId, expect.objectContaining({ allowed_mentions: { roles: ['7', '8'] } }));
			expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({ allowed_mentions: { roles: ['7'] } }));
		});

		test('GIVEN a private thread and no role to bring in THEN it is a public one: nobody would see it', async () => {
			useSettings({ appealsThread: 'private' });

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createThread).toHaveBeenCalledWith(channelId, expect.not.objectContaining({ type: ChannelType.PrivateThread }), messageId);
		});

		test('GIVEN a private thread in an announcement channel THEN it is a public one: Discord has no private ones there', async () => {
			useSettings({ appealsThread: 'private', appealsPingRoles: ['7'] });
			channel.type = ChannelType.GuildAnnouncement;

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createThread).toHaveBeenCalledWith(channelId, expect.not.objectContaining({ type: ChannelType.PrivateThread }), messageId);
		});

		test('GIVEN a form that requires a managed role THEN a member holding it can send it', async () => {
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm({ requiredRoles: ['1'], questions: [] }));
			fetchMember.mockResolvedValue({ roleIds: ['1'] });

			expect(await submitAppeal(guild, userId, '5', 12, {})).not.toEqual({ error: 'locked' });
		});

		test('GIVEN ping roles THEN they alone are mentioned', async () => {
			useSettings({ appealsPingRoles: ['7', '8'] });

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({ content: '<@&7> <@&8>', allowed_mentions: { roles: ['7', '8'] } }));
		});

		test('GIVEN an appeal still pending once it was sent THEN its message stays as it is', async () => {
			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(editMessage).not.toHaveBeenCalled();
		});

		test('GIVEN an appeal decided while its message was on its way THEN the message does not ask for a decision', async () => {
			vi.mocked(fetchAppeal).mockResolvedValue(createRow({ status: 'denied', reviewerId: moderatorId, reason: 'No' }));

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(editMessage).toHaveBeenCalledWith(
				channelId,
				messageId,
				expect.objectContaining({ components: [], allowed_mentions: { parse: [] } })
			);
		});

		test('GIVEN a decided appeal whose message cannot be changed THEN its thread starts all the same', async () => {
			const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);
			vi.mocked(fetchAppeal).mockResolvedValue(createRow({ status: 'denied', reviewerId: moderatorId, reason: 'No' }));
			editMessage.mockRejectedValueOnce(new Error('Unknown Message'));

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(createThread).toHaveBeenCalledOnce();
			expect(warn).toHaveBeenCalledOnce();
		});

		test('GIVEN a thread that cannot start THEN the appeal is made and sent all the same', async () => {
			const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);
			createThread.mockRejectedValueOnce(new Error('Missing Permissions'));

			const result = await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(result).toEqual({ appeal: createRow() });
			expect(setAppealMessage).toHaveBeenCalledOnce();
			expect(warn).toHaveBeenCalledOnce();
		});

		test('GIVEN no channel of the appeals THEN no message is remembered and no thread starts', async () => {
			vi.mocked(readSettings).mockResolvedValue({
				appealsEnabled: true,
				appealsBans: true,
				appealsChannel: null,
				appealsCooldownDays: 7,
				appealsMaxActive: 1
			} as never);

			await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' });

			expect(setAppealMessage).not.toHaveBeenCalled();
			expect(createThread).not.toHaveBeenCalled();
		});
	});

	describe('submitAppeal with forms', () => {
		beforeEach(() => {
			fetchCase.mockResolvedValue(new Map([[12, createEntry()]]));
			vi.mocked(fetchAppeal).mockResolvedValue(createRow());
		});

		test('GIVEN a form that was deleted THEN nothing is written', async () => {
			expect(await submitAppeal(guild, userId, '5', 12, { why: 'Sorry' })).toEqual({ error: 'notFound' });
			expect(createAppeal).not.toHaveBeenCalled();
		});

		test('GIVEN a form locked since the page was read THEN nothing is written', async () => {
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm({ enabled: false }));

			expect(await submitAppeal(guild, userId, '5', 12, { why: 'Sorry' })).toEqual({ error: 'locked' });
			expect(createAppeal).not.toHaveBeenCalled();
		});

		test('GIVEN a blocked user THEN nothing is written', async () => {
			vi.mocked(fetchAppealBlock).mockResolvedValue({ reason: 'Spam' } as never);
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm());

			expect(await submitAppeal(guild, userId, '5', 12, { why: 'Sorry' })).toEqual({ error: 'blocked' });
		});

		test('GIVEN the built-in form on a server that has one enabled THEN it does not exist', async () => {
			vi.mocked(fetchAppealForms).mockResolvedValue([createForm()]);

			expect(await submitAppeal(guild, userId, null, 12, { statement: 'Sorry' })).toEqual({ error: 'notFound' });
		});

		test('GIVEN a case the form does not offer THEN it is not appealable', async () => {
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm());

			expect(await submitAppeal(guild, userId, '5', 77, { why: 'Sorry' })).toEqual({ error: 'notAppealable' });
		});

		test('GIVEN answers to questions the form no longer has THEN they are invalid and nothing is written', async () => {
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm());

			expect(await submitAppeal(guild, userId, '5', 12, { gone: 'Sorry' })).toEqual({ error: 'invalid' });
			expect(createAppeal).not.toHaveBeenCalled();
		});

		test('GIVEN a member who left THEN a form with a required role is locked, and nothing throws', async () => {
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm({ requiredRoles: ['1'] }));

			expect(await submitAppeal(guild, userId, '5', 12, { why: 'Sorry' })).toEqual({ error: 'locked' });
		});

		test('GIVEN a good submission THEN the appeal keeps its form', async () => {
			vi.mocked(fetchAppealForm).mockResolvedValue(createForm());

			await submitAppeal(guild, userId, '5', 12, { why: 'Sorry' });

			expect(createAppeal).toHaveBeenCalledWith(container.prisma, guildId, expect.objectContaining({ formId: '5', caseId: 12 }));
		});
	});

	describe('getAppealPage', () => {
		beforeEach(() => {
			fetchCase.mockResolvedValue(new Map([[12, createEntry()]]));
		});

		test('GIVEN no enabled form THEN the page offers the built-in one', async () => {
			const page = await getAppealPage(guild, userId);

			expect(page.forms).toMatchObject([{ id: null, lock: null, cases: [{ id: 12 }] }]);
		});

		test('GIVEN a disabled form next to an enabled one THEN it is listed as locked, with no built-in form', async () => {
			vi.mocked(fetchAppealForms).mockResolvedValue([createForm(), createForm({ id: '6', enabled: false, lockReason: 'Closed' })]);

			const page = await getAppealPage(guild, userId);

			expect(page.forms).toMatchObject([
				{ id: '5', lock: null },
				{ id: '6', lock: 'disabled', lockReason: 'Closed', cases: [] }
			]);
		});

		test('GIVEN a blocked user THEN the page has the reason and no form', async () => {
			vi.mocked(fetchAppealBlock).mockResolvedValue({ reason: 'Spam' } as never);

			expect(await getAppealPage(guild, userId)).toMatchObject({ block: { reason: 'Spam' }, forms: [] });
		});

		test('GIVEN appeals that are off THEN the page offers nothing', async () => {
			vi.mocked(readSettings).mockResolvedValue({ appealsEnabled: false } as never);

			expect(await getAppealPage(guild, userId)).toMatchObject({ enabled: false, forms: [] });
		});

		test('GIVEN anonymous actions THEN the page never names who decided, and keeps the reason', async () => {
			vi.mocked(readSettings).mockResolvedValue({
				appealsEnabled: true,
				appealsBans: true,
				appealsAnonymous: true,
				appealsCooldownDays: 0,
				appealsMaxActive: 1
			} as never);
			vi.mocked(fetchUserAppeals).mockResolvedValue([createRow({ status: 'denied', reviewerId: moderatorId, reason: 'No' })]);

			const page = await getAppealPage(guild, userId);

			expect(page.appeals).toMatchObject([{ reviewerId: null, reason: 'No' }]);
		});

		test('GIVEN anonymous actions off THEN the page tells who decided', async () => {
			vi.mocked(fetchUserAppeals).mockResolvedValue([createRow({ status: 'denied', reviewerId: moderatorId, reason: 'No' })]);

			const page = await getAppealPage(guild, userId);

			expect(page.appeals).toMatchObject([{ reviewerId: moderatorId }]);
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

	describe('settleAppeal, what follows a decision', () => {
		test('GIVEN a denial with the block on THEN the member is blocked, by the moderator and automatically', async () => {
			useSettings({ appealsBlockOnDenial: true });

			await settleAppeal(guild, createRow(), false, moderatorId, 'No');

			expect(createAppealBlock).toHaveBeenCalledWith(container.prisma, guildId, { userId, reason: 'No', moderatorId, automatic: true });
		});

		test('GIVEN an approval with the block on THEN nobody is blocked', async () => {
			useSettings({ appealsBlockOnDenial: true });

			await settleAppeal(guild, createRow(), true, moderatorId, null);

			expect(createAppealBlock).not.toHaveBeenCalled();
		});

		test('GIVEN a decision THEN the thread of the appeal is archived', async () => {
			await settleAppeal(guild, createRow({ threadId }), false, moderatorId, null);

			expect(editChannel).toHaveBeenCalledWith(threadId, { archived: true });
		});

		test('GIVEN an approval of a case in course THEN it is undone', async () => {
			await settleAppeal(guild, createRow(), true, moderatorId, null);

			expect(ModerationActions.ban.undo).toHaveBeenCalledOnce();
		});

		test.each([
			['ended', { isCompleted: () => true }],
			['archived', { isArchived: () => true }]
		])('GIVEN an approval of a case that %s meanwhile THEN nothing is undone, and the decision stands', async (_, state) => {
			fetchCase.mockResolvedValue(createEntry(TypeVariation.Ban, state));

			expect(await settleAppeal(guild, createRow(), true, moderatorId, null)).toHaveProperty('message');
			expect(ModerationActions.ban.undo).not.toHaveBeenCalled();
		});

		test('GIVEN a direct message that does not arrive THEN the message of the appeal says so', async () => {
			send.mockRejectedValue(new Error('Cannot send messages to this user'));

			const result = await settleAppeal(guild, createRow(), false, moderatorId, 'No');

			expect(JSON.stringify(result)).toContain('appealNotDelivered');
		});

		test('GIVEN a direct message that arrives THEN it says nothing about it', async () => {
			expect(JSON.stringify(await settleAppeal(guild, createRow(), false, moderatorId, 'No'))).not.toContain('appealNotDelivered');
		});

		test('GIVEN a thread that is gone THEN the decision stands', async () => {
			const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);
			editChannel.mockRejectedValueOnce(new Error('Unknown Channel'));

			expect(await settleAppeal(guild, createRow({ threadId }), false, moderatorId, null)).toHaveProperty('message');
			expect(warn).toHaveBeenCalledOnce();
		});

		test('GIVEN anonymous actions THEN the direct message names nobody', async () => {
			useSettings({ appealsAnonymous: true });
			fetchUser.mockResolvedValue({ send, username: 'mod' });

			await settleAppeal(guild, createRow(), false, moderatorId, 'No');

			expect(vi.mocked(send).mock.calls[0][0].content).not.toContain('mod"');
		});

		test('GIVEN no anonymous actions THEN the direct message tells who decided', async () => {
			fetchUser.mockResolvedValue({ send, username: 'mod' });

			await settleAppeal(guild, createRow(), false, moderatorId, 'No');

			expect(vi.mocked(send).mock.calls[0][0].content).toContain('appealDmDecidedBy');
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
			const view = renderAppealView(t, createRow(), createEntry());

			expect(view.components).toEqual([]);
			expect(view.embeds[0].fields).toEqual([{ name: 'Why?', value: 'Sorry' }]);
		});

		test('GIVEN a decided appeal THEN it tells what was decided and by whom', () => {
			const appeal = createRow({ status: 'denied', reviewerId: moderatorId, reason: 'No' });
			const [embed] = renderAppealView(t, appeal, createEntry()).embeds;

			expect(embed.footer?.text).toContain('appealDenied');
			expect(embed.fields?.at(-1)?.value).toBe(`<@${moderatorId}>`);
		});

		test('GIVEN an answer of each kind THEN each reads as what the member gave', () => {
			const file = { key: 'k', name: 'a](http://evil).png', size: 1, contentType: 'image/png' };
			const appeal = createRow({
				answers: [
					{ questionId: 'a', kind: 'choice', label: 'Which?', value: ['One', 'Two'] },
					{ questionId: 'b', kind: 'attachment', label: 'Proof', value: [file] }
				]
			});

			const [embed] = renderAppealView(t, appeal, createEntry()).embeds;

			expect(embed.fields?.[0]).toEqual({ name: 'Which?', value: 'One, Two' });
			expect(embed.fields?.[1].value).toBe(`[ahttp://evil.png](https://wolfstar.rocks/appeal-files/${guildId}/1/0)`);
		});

		test('GIVEN the longest answers and a long reason THEN the embed fits what Discord takes', () => {
			const answers = Array.from({ length: 5 }, (_, index) => ({
				questionId: `q${index}`,
				kind: 'text' as const,
				label: 'L'.repeat(100),
				value: 'V'.repeat(1000)
			}));
			const appeal = createRow({ answers, status: 'denied', reviewerId: moderatorId, reason: 'R'.repeat(500) });
			const entry = createEntry(TypeVariation.Ban, { reason: 'C'.repeat(2000) });

			const [embed] = renderAppealView(t, appeal, entry).embeds;
			const fields = (embed.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0);

			expect((embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0) + fields).toBeLessThanOrEqual(
				6000
			);
		});

		test('GIVEN an appeal that was sent THEN it links to its message', () => {
			const { components } = renderAppealView(t, createRow({ channelId, messageId }), createEntry());

			expect(components[0].components[0]).toMatchObject({ url: `https://discord.com/channels/${guildId}/${channelId}/${messageId}` });
		});
	});
});
