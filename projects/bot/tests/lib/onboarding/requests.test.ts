import { failOnboardingStageLocked, fetchOnboardingMember, passOnboardingStageLocked } from '#lib/onboarding/members';
import { handleOnboardingRequest } from '#lib/onboarding/requests';
import { readOnboardingConfig } from '#lib/onboarding/store';
import { container } from '@wolfstar/http-framework';
import {
	completeOnboardingRequest,
	fetchOnboardingVerification,
	fetchUnprocessedOnboardingRequest,
	type OnboardingConfig,
	type OnboardingStage,
	type OnboardingVerification
} from 'wolfstar-database';

vi.mock('#lib/onboarding/members', () => ({
	failOnboardingStageLocked: vi.fn(),
	fetchOnboardingMember: vi.fn(),
	passOnboardingStageLocked: vi.fn()
}));
vi.mock('#lib/onboarding/store', () => ({
	readOnboardingConfig: vi.fn(),
	withOnboardingMemberLock: (_guildId: string, _userId: string, callback: () => Promise<unknown>) => callback()
}));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	completeOnboardingRequest: vi.fn(),
	fetchOnboardingVerification: vi.fn(),
	fetchUnprocessedOnboardingRequest: vi.fn()
}));

const guildId = '254360814063058944';
const userId = '266624760782258186';
const guild = { id: guildId };
const member = { guildId, id: userId, joinedTimestamp: null };

const stage: OnboardingStage = {
	id: '7',
	guildId,
	position: 0,
	name: 'Captcha',
	enabled: true,
	trigger: 'Join',
	challenge: 'Captcha',
	question: null,
	answers: [],
	maxAttempts: 3,
	timeLimit: 600,
	roleId: null,
	failureAction: 'None',
	failureTimeout: null,
	createdAt: 0
};

function verification(overrides: Partial<OnboardingVerification> = {}): OnboardingVerification {
	return {
		id: '40',
		guildId,
		userId,
		stageId: stage.id,
		stageName: stage.name,
		status: 'Waiting',
		attempts: 0,
		createdAt: Date.now() - 60_000,
		resolvedAt: null,
		...overrides
	};
}

function config(overrides: { enabled?: boolean; stage?: Partial<OnboardingStage> } = {}): OnboardingConfig {
	return {
		settings: { enabled: overrides.enabled ?? true, logChannelId: null, channelId: null, messageId: null, revision: 0 },
		stages: [{ ...stage, ...overrides.stage }]
	};
}

describe('handleOnboardingRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchUnprocessedOnboardingRequest).mockResolvedValue({ id: '1', guildId, userId, verificationId: '40' });
		vi.mocked(completeOnboardingRequest).mockResolvedValue(true);
		vi.mocked(readOnboardingConfig).mockResolvedValue(config());
		vi.mocked(fetchOnboardingMember).mockResolvedValue(member as never);
		vi.mocked(fetchOnboardingVerification).mockResolvedValue(verification());
		vi.mocked(passOnboardingStageLocked).mockResolvedValue({ kind: 'Passed', next: null });
		vi.mocked(failOnboardingStageLocked).mockResolvedValue('Failed');
		Object.assign(container, {
			prisma: { orm: {} },
			redis: undefined,
			gatewayClient: { guilds: { fetch: vi.fn(async () => guild) } }
		});
	});

	test('GIVEN a member who waits at a Captcha stage THEN they pass it, and the request is done', async () => {
		expect(await handleOnboardingRequest('1')).toBe('Done');
		expect(passOnboardingStageLocked).toHaveBeenCalledWith(member, config(), stage, expect.objectContaining({ id: '40', status: 'Waiting' }));
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', null);
	});

	test('GIVEN the onboarding switched off THEN nobody passes, and the request ends with off', async () => {
		vi.mocked(readOnboardingConfig).mockResolvedValue(config({ enabled: false }));

		expect(await handleOnboardingRequest('1')).toBe('Failed');
		expect(passOnboardingStageLocked).not.toHaveBeenCalled();
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^off: /));
	});

	test('GIVEN a member who left THEN the request ends with notMember', async () => {
		vi.mocked(fetchOnboardingMember).mockResolvedValue(null);

		await handleOnboardingRequest('1');

		expect(passOnboardingStageLocked).not.toHaveBeenCalled();
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^notMember: /));
	});

	test.each<[string, { verification?: Partial<OnboardingVerification>; stage?: Partial<OnboardingStage> }]>([
		['a row that no longer waits', { verification: { status: 'Passed' } }],
		['the row of another member', { verification: { userId: '242043489611808769' } }],
		['a stage switched off', { stage: { enabled: false } }],
		['a stage whose challenge changed', { stage: { challenge: 'Button' } }]
	])('GIVEN %s THEN nobody passes, and the request ends with stale', async (_, overrides) => {
		vi.mocked(fetchOnboardingVerification).mockResolvedValue(verification(overrides.verification));
		vi.mocked(readOnboardingConfig).mockResolvedValue(config({ stage: overrides.stage }));

		expect(await handleOnboardingRequest('1')).toBe('Failed');
		expect(passOnboardingStageLocked).not.toHaveBeenCalled();
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^stale: /));
	});

	test('GIVEN a row of an earlier stay, before the member left and joined again THEN nobody passes', async () => {
		vi.mocked(fetchOnboardingMember).mockResolvedValue({ ...member, joinedTimestamp: Date.now() - 1000 } as never);

		expect(await handleOnboardingRequest('1')).toBe('Failed');
		expect(passOnboardingStageLocked).not.toHaveBeenCalled();
		expect(failOnboardingStageLocked).not.toHaveBeenCalled();
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^stale: /));
	});

	test('GIVEN a member whose time ran out THEN they fail the stage, and the request ends with expired', async () => {
		const late = verification({ createdAt: Date.now() - (stage.timeLimit + 1) * 1000 });
		vi.mocked(fetchOnboardingVerification).mockResolvedValue(late);

		expect(await handleOnboardingRequest('1')).toBe('Failed');
		expect(passOnboardingStageLocked).not.toHaveBeenCalled();
		expect(failOnboardingStageLocked).toHaveBeenCalledWith(guild, config(), stage, late, 'TimeLimit');
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^expired: /));
	});

	test('GIVEN a role Discord refuses THEN the row still waits, and the request ends with roleRefused', async () => {
		vi.mocked(passOnboardingStageLocked).mockResolvedValue({ kind: 'RoleRefused', error: 'Missing Permissions' });

		expect(await handleOnboardingRequest('1')).toBe('Failed');
		expect(completeOnboardingRequest).toHaveBeenCalledWith(container.prisma, '1', expect.stringMatching(/^roleRefused: /));
	});

	test('GIVEN a request heard twice THEN the second finds it done, and passes nobody again', async () => {
		await handleOnboardingRequest('1');
		vi.mocked(fetchUnprocessedOnboardingRequest).mockResolvedValue(null);

		expect(await handleOnboardingRequest('1')).toBe('Claimed');
		expect(passOnboardingStageLocked).toHaveBeenCalledOnce();
	});
});
