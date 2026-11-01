import { hasAppealAccess } from '#lib/moderation/appealAccess';
import { updateAppealMessage } from '#lib/moderation/appealCommands';
import { handleAppealRequest } from '#lib/moderation/appealRequests';
import { settleAppeal } from '#lib/moderation/appealService';
import { container } from '@wolfstar/http-framework';
import {
	completeAppealRequest,
	createAppealBlock,
	deleteAppealBlock,
	fetchAppeal,
	fetchUnprocessedAppealRequest,
	type AppealRequest
} from 'wolfstar-database';

vi.mock('#lib/moderation/appealAccess', () => ({ hasAppealAccess: vi.fn() }));
vi.mock('#lib/moderation/appealCommands', () => ({ updateAppealMessage: vi.fn() }));
vi.mock('#lib/moderation/appealService', () => ({ settleAppeal: vi.fn() }));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	completeAppealRequest: vi.fn(),
	createAppealBlock: vi.fn(),
	deleteAppealBlock: vi.fn(),
	fetchAppeal: vi.fn(),
	fetchUnprocessedAppealRequest: vi.fn()
}));

const guildId = '254360814063058944';
const moderatorId = '242043489611808769';
const userId = '266624760782258186';
const guild = { id: guildId };
const appeal = { id: '3', caseId: 12 };
const message = { embeds: [], components: [] };

function request(overrides: Partial<AppealRequest> = {}): AppealRequest {
	return { id: '1', guildId, kind: 'Approve', appealId: '3', userId: null, moderatorId, reason: 'Fine', ...overrides };
}

describe('handleAppealRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(hasAppealAccess).mockResolvedValue(true);
		vi.mocked(fetchAppeal).mockResolvedValue(appeal as never);
		vi.mocked(fetchUnprocessedAppealRequest).mockResolvedValue(request());
		vi.mocked(settleAppeal).mockResolvedValue({ message });
		vi.mocked(completeAppealRequest).mockResolvedValue(true);
		Object.assign(container, { prisma: {}, redis: undefined, gatewayClient: { guilds: { fetch: vi.fn(async () => guild) } } });
	});

	test('GIVEN a moderator with no access THEN nothing is decided, and the request says why', async () => {
		vi.mocked(hasAppealAccess).mockResolvedValue(false);

		expect(await handleAppealRequest('1')).toBe('Failed');
		expect(settleAppeal).not.toHaveBeenCalled();
		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^noAccess: /));
	});

	test.each([
		['Approve', true],
		['Deny', false]
	] as const)('GIVEN %s THEN it is decided as on Discord, and its message updated', async (kind, accept) => {
		vi.mocked(fetchUnprocessedAppealRequest).mockResolvedValue(request({ kind }));

		expect(await handleAppealRequest('1')).toBe('Done');
		expect(settleAppeal).toHaveBeenCalledWith(guild, appeal, accept, moderatorId, 'Fine');
		expect(updateAppealMessage).toHaveBeenCalledWith(guildId, appeal, message);
		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', null);
	});

	test('GIVEN an appeal decided on Discord meanwhile THEN the request ends with the code decided', async () => {
		vi.mocked(settleAppeal).mockResolvedValue({ error: 'decided' });

		expect(await handleAppealRequest('1')).toBe('Failed');
		expect(updateAppealMessage).not.toHaveBeenCalled();
		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^decided: /));
	});

	test('GIVEN a request heard twice THEN the second finds it done, and decides nothing', async () => {
		await handleAppealRequest('1');
		vi.mocked(fetchUnprocessedAppealRequest).mockResolvedValue(null);

		expect(await handleAppealRequest('1')).toBe('Claimed');
		expect(settleAppeal).toHaveBeenCalledOnce();
	});

	test('GIVEN an appeal that is gone THEN the request ends with caseGone', async () => {
		vi.mocked(fetchAppeal).mockResolvedValue(null);

		await handleAppealRequest('1');

		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^caseGone: /));
	});

	test('GIVEN a block of a blocked user THEN the request ends with blocked', async () => {
		vi.mocked(fetchUnprocessedAppealRequest).mockResolvedValue(request({ kind: 'Block', appealId: null, userId }));
		vi.mocked(createAppealBlock).mockResolvedValue(false);

		await handleAppealRequest('1');

		expect(createAppealBlock).toHaveBeenCalledWith(container.prisma, guildId, { userId, reason: 'Fine', moderatorId, automatic: false });
		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^blocked: /));
	});

	test('GIVEN an unblock of nobody THEN the request ends with notBlocked', async () => {
		vi.mocked(fetchUnprocessedAppealRequest).mockResolvedValue(request({ kind: 'Unblock', appealId: null, userId }));
		vi.mocked(deleteAppealBlock).mockResolvedValue(false);

		await handleAppealRequest('1');

		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^notBlocked: /));
	});

	test('GIVEN something that throws THEN the request ends, and is not swept forever', async () => {
		const error = vi.spyOn(container.logger, 'error').mockImplementation(() => undefined);
		vi.mocked(settleAppeal).mockRejectedValue(new Error('Boom'));

		expect(await handleAppealRequest('1')).toBe('Failed');
		expect(error).toHaveBeenCalledOnce();
		expect(completeAppealRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^failed: /));
	});
});
