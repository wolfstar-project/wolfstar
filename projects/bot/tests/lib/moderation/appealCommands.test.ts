import { filterAppealChoices, getAppealChoices, runAppealDecision } from '#lib/moderation/appealCommands';
import { settleAppeal } from '#lib/moderation/appealService';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import { fetchAppeal, fetchAppealByCase, fetchAppeals, type Appeal } from 'wolfstar-database';

vi.mock('#lib/moderation/appealService', () => ({
	AppealSettleErrorKeys: { caseGone: 'case-gone', decided: 'already-decided', undoFailed: 'undo-failed' },
	settleAppeal: vi.fn()
}));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchAppeal: vi.fn(),
	fetchAppealByCase: vi.fn(),
	fetchAppeals: vi.fn()
}));
vi.mock('#utils/functions', () => ({ getModeration: vi.fn() }));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: vi.fn(() => (key: string) => key)
}));

const guildId = '254360814063058944';
const moderatorId = '242043489611808769';

function createAppeal(overrides: Partial<Appeal> = {}): Appeal {
	return {
		id: '1',
		guildId,
		caseId: 12,
		userId: '266624760782258186',
		formId: null,
		answers: [],
		status: 'pending',
		reviewerId: null,
		reason: null,
		channelId: '254360814063058945',
		messageId: '254360814063058946',
		threadId: null,
		decidedAt: null,
		createdAt: 0,
		...overrides
	};
}

describe('/appeal approve and /appeal deny', () => {
	const message = { embeds: [], components: [] };
	const editMessage = vi.fn(async () => ({}));
	const update = vi.fn(async (data: { content: string }) => data);
	const reply = vi.fn();
	const guild = { id: guildId };

	function run(options: { appeal: string; reason?: string }, accept = true) {
		const interaction = { guildId, user: { id: moderatorId }, reply, defer: vi.fn(async () => ({ update })) };
		return runAppealDecision(interaction as never, options, accept);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchAppealByCase).mockResolvedValue(createAppeal());
		vi.mocked(fetchAppeal).mockResolvedValue(createAppeal());
		vi.mocked(settleAppeal).mockResolvedValue({ message });
		Object.assign(container, { prisma: {}, gatewayClient: { guilds: { fetch: vi.fn(async () => guild) }, api: { channels: { editMessage } } } });
	});

	test.each(['nope', '0'])('GIVEN the option %j, which is not a case THEN nothing is decided', async (appeal) => {
		await run({ appeal });

		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'commands/appeal:notFound' }));
		expect(settleAppeal).not.toHaveBeenCalled();
	});

	test('GIVEN a case with no appeal THEN nothing is decided', async () => {
		vi.mocked(fetchAppealByCase).mockResolvedValue(null);

		await run({ appeal: '12' });

		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'commands/appeal:notFound' }));
		expect(settleAppeal).not.toHaveBeenCalled();
	});

	test('GIVEN an appeal THEN it is decided in the name of the moderator with the reason trimmed', async () => {
		await run({ appeal: '#12', reason: '  we talked  ' }, false);

		expect(fetchAppealByCase).toHaveBeenCalledWith(container.prisma, guildId, 12);
		expect(settleAppeal).toHaveBeenCalledWith(guild, expect.objectContaining({ id: '1' }), false, moderatorId, 'we talked');
	});

	test('GIVEN a blank reason THEN the decision has none', async () => {
		await run({ appeal: '12', reason: '   ' });

		expect(settleAppeal).toHaveBeenCalledWith(guild, expect.anything(), true, moderatorId, null);
	});

	test.each([
		[true, 'commands/appeal:approved'],
		[false, 'commands/appeal:denied']
	])('GIVEN the decision %s THEN its message stops asking for one and the moderator is told', async (accept, content) => {
		await run({ appeal: '12' }, accept);

		expect(editMessage).toHaveBeenCalledWith(
			'254360814063058945',
			'254360814063058946',
			expect.objectContaining({ ...message, allowed_mentions: { parse: [] } })
		);
		expect(update).toHaveBeenCalledWith({ content });
	});

	test('GIVEN a message sent after the appeal was read THEN it stops asking for a decision too', async () => {
		vi.mocked(fetchAppealByCase).mockResolvedValue(createAppeal({ channelId: null, messageId: null }));

		await run({ appeal: '12' });

		expect(editMessage).toHaveBeenCalledWith('254360814063058945', '254360814063058946', expect.anything());
	});

	test('GIVEN an appeal whose message was never sent THEN it is decided all the same', async () => {
		vi.mocked(fetchAppeal).mockResolvedValue(createAppeal({ channelId: null, messageId: null }));

		await run({ appeal: '12' });

		expect(editMessage).not.toHaveBeenCalled();
		expect(update).toHaveBeenCalledWith({ content: 'commands/appeal:approved' });
	});

	test('GIVEN the appeal cannot be read again THEN the decision stands and is told', async () => {
		const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);
		vi.mocked(fetchAppeal).mockRejectedValue(new Error('Connection lost'));

		await run({ appeal: '12' });

		expect(warn).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledWith({ content: 'commands/appeal:approved' });
	});

	test('GIVEN a message that cannot be changed THEN the decision stands and is told', async () => {
		const warn = vi.spyOn(container.logger, 'warn').mockImplementation(() => undefined);
		editMessage.mockRejectedValueOnce(new Error('Unknown Message'));

		await run({ appeal: '12' });

		expect(warn).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledWith({ content: 'commands/appeal:approved' });
	});

	test.each([
		['decided', 'already-decided'],
		['undoFailed', 'undo-failed'],
		['caseGone', 'case-gone']
	] as const)('GIVEN the error %s THEN the moderator is told and the message stays', async (error, content) => {
		vi.mocked(settleAppeal).mockResolvedValue({ error });

		await run({ appeal: '12' });

		expect(editMessage).not.toHaveBeenCalled();
		expect(update).toHaveBeenCalledWith({ content });
	});
});

describe('the choices of the appeal option', () => {
	const appeals = [createAppeal({ caseId: 123 }), createAppeal({ caseId: 12, userId: '999' }), createAppeal({ caseId: 7 })];

	test('GIVEN nothing written THEN the latest appeals are suggested', () => {
		expect(filterAppealChoices(appeals, '').map((appeal) => appeal.caseId)).toEqual([123, 12, 7]);
	});

	test.each(['12', '#12', ' 12 '])('GIVEN %j THEN the cases that start with it are suggested', (query) => {
		expect(filterAppealChoices(appeals, query).map((appeal) => appeal.caseId)).toEqual([123, 12]);
	});

	test('GIVEN the ID of a user THEN their appeals are suggested', () => {
		expect(filterAppealChoices(appeals, '999').map((appeal) => appeal.caseId)).toEqual([12]);
	});

	test('GIVEN more appeals than Discord shows THEN it stops at 25', () => {
		const many = Array.from({ length: 30 }, (_, index) => createAppeal({ caseId: index + 1 }));

		expect(filterAppealChoices(many, '')).toHaveLength(25);
	});

	describe('getAppealChoices', () => {
		const t = ((key: string, options?: Record<string, unknown>) => (options ? JSON.stringify(options) : key)) as never;
		const resolve = vi.fn();
		const fetchUser = vi.fn();

		beforeEach(() => {
			vi.clearAllMocks();
			vi.mocked(fetchAppeals).mockResolvedValue([createAppeal()]);
			vi.mocked(getModeration).mockResolvedValue({
				fetch: vi.fn(async () => ({ type: TypeVariation.Ban, isUndo: () => false, isTemporary: () => false }))
			} as never);
			Object.assign(container, { prisma: {}, gatewayClient: { users: { resolve, fetch: fetchUser } } });
		});

		test('GIVEN a user the cache knows THEN their name tells them apart, and the value is the case', async () => {
			resolve.mockResolvedValue({ username: 'pete' });

			const [choice] = await getAppealChoices(t, guildId, '', false);

			expect(choice.name).toContain('pete');
			expect(choice.value).toBe('12');
		});

		test('GIVEN a user the cache does not know THEN their ID stands for them, with no request: Discord only waits 3 seconds', async () => {
			resolve.mockResolvedValue(null);

			const [choice] = await getAppealChoices(t, guildId, '', false);

			expect(choice.name).toContain('266624760782258186');
			expect(fetchUser).not.toHaveBeenCalled();
		});

		test.each([
			[true, 'pending'],
			[false, undefined]
		])('GIVEN pendingOnly %s THEN the appeals read are the ones in the status %s', async (pendingOnly, status) => {
			resolve.mockResolvedValue(null);

			await getAppealChoices(t, guildId, '', pendingOnly);

			expect(fetchAppeals).toHaveBeenCalledWith(container.prisma, guildId, expect.objectContaining({ status }));
		});
	});
});
