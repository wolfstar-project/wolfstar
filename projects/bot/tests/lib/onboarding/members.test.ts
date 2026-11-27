import { ModerationActions } from '#lib/moderation/actions/index';
import { sendOnboardingLog } from '#lib/onboarding/log';
import {
	advanceOnboardingLocked,
	failOnboardingStageLocked,
	getOnboardingTimeLimitTaskId,
	passOnboardingStageLocked,
	resumeOnboardingTimeLimits,
	runOnboardingTimeLimit,
	startOnboardingStage,
	syncOnboardingTimeLimits
} from '#lib/onboarding/members';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { OnboardingConfig, OnboardingStage, OnboardingVerification, OnboardingVerificationStatus } from 'wolfstar-database';

// The rows of the members and the configuration, in place of the tables, with what the database guarantees: a row
// is resolved only while it waits.
const { table, state } = vi.hoisted(() => ({
	table: new Map<string, OnboardingVerification>(),
	state: { config: null as unknown as OnboardingConfig }
}));

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchOnboardingConfig: vi.fn(async () => state.config),
	fetchOnboardingStages: vi.fn(async () => state.config.stages),
	fetchOnboardingVerification: vi.fn(async (_orm: unknown, id: string) => table.get(id) ?? null),
	fetchOnboardingVerifications: vi.fn(async (_orm: unknown, guildId: string, userId: string) =>
		[...table.values()].filter((row) => row.guildId === guildId && row.userId === userId)
	),
	fetchWaitingOnboardingVerifications: vi.fn(async (_orm: unknown, guildId: string) =>
		[...table.values()].filter((row) => row.guildId === guildId && row.status === 'Waiting')
	),
	createOnboardingVerification: vi.fn(async (_db: unknown, data: { guildId: string; userId: string; stage: { id: string; name: string } }) =>
		addRow({ guildId: data.guildId, userId: data.userId, stageId: data.stage.id, stageName: data.stage.name, createdAt: Date.now() })
	),
	resolveOnboardingVerification: vi.fn(async (_db: unknown, id: string, status: Exclude<OnboardingVerificationStatus, 'Waiting'>) => {
		const row = table.get(id);
		if (row?.status !== 'Waiting') return false;
		table.set(id, { ...row, status, resolvedAt: Date.now() });
		return true;
	}),
	recordOnboardingAttempt: vi.fn(async (_db: unknown, id: string, attempts: number) => {
		const row = table.get(id);
		if (row?.status !== 'Waiting' || row.attempts !== attempts) return false;
		table.set(id, { ...row, attempts: attempts + 1 });
		return true;
	})
}));
vi.mock('#lib/onboarding/store', () => ({
	readOnboardingConfig: vi.fn(async () => state.config),
	withOnboardingMemberLock: vi.fn((_guildId: string, _userId: string, callback: () => Promise<unknown>) => callback())
}));
vi.mock('#lib/moderation/actions/index', () => ({ ModerationActions: { kick: { apply: vi.fn() }, timeout: { apply: vi.fn() } } }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#utils/functions', () => ({ getModeration: vi.fn(async () => ({ createLock: () => () => undefined })) }));
vi.mock('#lib/onboarding/log', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/onboarding/log')>()),
	sendOnboardingLog: vi.fn()
}));

const guildId = '254360814063058944';
const userId = '268792781713965056';
const roleId = '300';
const minute = 60_000;
const guild = { id: guildId, name: 'Server' } as unknown as Guild;

const createTask = vi.fn(async (..._args: unknown[]) => undefined);
const deleteTask = vi.fn(async (..._args: unknown[]) => undefined);
const fetchMember = vi.fn();

// The member Discord knows now, `null` once they left:
let joinedTimestamp: number | null;
let refuseRole: boolean;

function createStage(id: string, overrides: Partial<OnboardingStage> = {}): OnboardingStage {
	return {
		id,
		guildId,
		position: Number(id),
		name: `Stage ${id}`,
		enabled: true,
		trigger: 'Join',
		challenge: 'Button',
		question: null,
		answers: [],
		maxAttempts: 3,
		timeLimit: 600,
		roleId: null,
		failureAction: 'Kick',
		failureTimeout: null,
		createdAt: 0,
		...overrides
	};
}

function addRow(overrides: Partial<OnboardingVerification> = {}): OnboardingVerification {
	const row: OnboardingVerification = {
		id: String(table.size + 1),
		guildId,
		userId,
		stageId: '1',
		stageName: 'Stage 1',
		status: 'Waiting',
		attempts: 0,
		createdAt: Date.now() - 11 * minute,
		resolvedAt: null,
		...overrides
	};
	table.set(row.id, row);
	return row;
}

function setConfig(stages: OnboardingStage[], enabled = true) {
	state.config = { settings: { enabled, logChannelId: '900', channelId: null, messageId: null, revision: 1 }, stages };
}

function createMember() {
	const user = { id: userId, bot: false, toJSON: () => ({ id: userId }) };
	return {
		id: userId,
		guildId,
		user,
		joinedTimestamp,
		flags: { has: () => false },
		fetchUser: async () => user,
		roles: {
			add: vi.fn(async () => {
				if (refuseRole)
					throw new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'PUT', 'https://discord.com', {});
			})
		}
	} as unknown as GuildMember;
}

function deadlineOf(row: OnboardingVerification, stage: OnboardingStage) {
	return row.createdAt + stage.timeLimit * 1000;
}

function scheduledJobIds() {
	return createTask.mock.calls.map((call) => (call[1] as { customJobOptions: { jobId: string } }).customJobOptions.jobId);
}

beforeEach(() => {
	vi.clearAllMocks();
	table.clear();
	setConfig([createStage('1')]);
	joinedTimestamp = Date.now() - 12 * minute;
	refuseRole = false;
	createTask.mockImplementation(async () => undefined);
	fetchMember.mockImplementation(async () => {
		if (joinedTimestamp === null)
			throw new DiscordAPIError({ code: 10007, message: 'Unknown Member' }, 10007, 404, 'GET', 'https://discord.com', {});
		return createMember();
	});
	vi.mocked(ModerationActions.kick.apply).mockResolvedValue({ id: 42 } as never);
	Object.assign(container, {
		prisma: { orm: {} },
		redis: undefined,
		tasks: { create: createTask, delete: deleteTask },
		logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
		gatewayClient: {
			guilds: { resolve: vi.fn(async () => guild), fetch: vi.fn(async () => guild) },
			members: { fetch: fetchMember },
			users: { fetch: vi.fn(async () => ({ id: userId, toJSON: () => ({ id: userId }) })) }
		}
	});
});

describe('runOnboardingTimeLimit', () => {
	test('GIVEN a member whose time ran out THEN the failure action is taken and the row failed', async () => {
		const row = addRow();

		expect(await runOnboardingTimeLimit(row.id, deadlineOf(row, createStage('1')))).toBe('Failed');
		expect(ModerationActions.kick.apply).toHaveBeenCalledOnce();
		expect(table.get(row.id)!.status).toBe('Failed');
	});

	test('GIVEN the module off THEN the member is not kicked and still waits', async () => {
		setConfig([createStage('1')], false);
		const row = addRow();

		expect(await runOnboardingTimeLimit(row.id, deadlineOf(row, createStage('1')))).toBe('Off');
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Waiting');
	});

	test('GIVEN the stage off THEN the member is not kicked and still waits', async () => {
		setConfig([createStage('1', { enabled: false })]);
		const row = addRow();

		expect(await runOnboardingTimeLimit(row.id, deadlineOf(row, createStage('1')))).toBe('Off');
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Waiting');
	});

	test('GIVEN the stage was deleted THEN the row no longer counts as waiting', async () => {
		setConfig([]);
		const row = addRow();
		const orphan = addRow({ stageId: null });

		expect(await runOnboardingTimeLimit(row.id, 0)).toBe('Left');
		expect(await runOnboardingTimeLimit(orphan.id, 0)).toBe('Left');
		expect(table.get(row.id)!.status).toBe('Left');
		expect(table.get(orphan.id)!.status).toBe('Left');
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
	});

	test('GIVEN a member who left while the bot did not see it THEN they are not kicked, and the row says they left', async () => {
		const row = addRow();
		joinedTimestamp = null;

		expect(await runOnboardingTimeLimit(row.id, deadlineOf(row, createStage('1')))).toBe('Left');
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Left');
	});

	test('GIVEN a member who left and joined again while the bot did not see it THEN the deadline of the earlier stay does nothing to them', async () => {
		const row = addRow();
		joinedTimestamp = Date.now() - minute;

		expect(await runOnboardingTimeLimit(row.id, deadlineOf(row, createStage('1')))).toBe('Left');
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Left');
	});

	test('GIVEN a time limit made longer since THEN a job with an ID of its own is scheduled, since the running one keeps its ID', async () => {
		const stage = createStage('1', { timeLimit: 1200 });
		setConfig([stage]);
		const row = addRow();
		const runAt = row.createdAt + 600_000;

		expect(await runOnboardingTimeLimit(row.id, runAt)).toBe('Later');
		expect(scheduledJobIds()).toEqual([getOnboardingTimeLimitTaskId(row.id, deadlineOf(row, stage))]);
		expect(scheduledJobIds()).not.toContain(getOnboardingTimeLimitTaskId(row.id, runAt));
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
	});

	test('GIVEN a kick Discord refuses THEN the member still waits, so the job is tried again', async () => {
		const row = addRow();
		vi.mocked(ModerationActions.kick.apply).mockRejectedValue(
			new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'DELETE', 'https://discord.com', {})
		);

		expect(await runOnboardingTimeLimit(row.id, deadlineOf(row, createStage('1')))).toBe('Refused');
		expect(table.get(row.id)!.status).toBe('Waiting');
		expect(sendOnboardingLog).toHaveBeenCalledWith(
			guildId,
			'900',
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ kind: 'Failed', outcome: expect.objectContaining({ kind: 'Refused' }) })
		);
	});
});

describe('failOnboardingStageLocked', () => {
	test('GIVEN a kick Discord refuses after the last wrong answer THEN the member still waits, and a job tries again later', async () => {
		const stage = createStage('1', { timeLimit: 0 });
		const row = addRow({ attempts: 3 });
		vi.mocked(ModerationActions.kick.apply).mockRejectedValue(new Error('Gateway down'));

		expect(await failOnboardingStageLocked(guild, state.config, stage, row, 'Attempts')).toBe('Refused');
		expect(table.get(row.id)!.status).toBe('Waiting');
		expect(createTask).toHaveBeenCalledOnce();
	});
});

describe('passOnboardingStageLocked', () => {
	test('GIVEN a role Discord refuses THEN the stage is not passed, and the member can pass it once the role can be given', async () => {
		const stage = createStage('1', { roleId });
		setConfig([stage]);
		const row = addRow({ createdAt: Date.now() });
		refuseRole = true;

		expect(await passOnboardingStageLocked(createMember(), state.config, stage, row)).toMatchObject({ kind: 'RoleRefused' });
		expect(table.get(row.id)!.status).toBe('Waiting');

		refuseRole = false;
		expect(await passOnboardingStageLocked(createMember(), state.config, stage, row)).toMatchObject({ kind: 'Passed' });
		expect(table.get(row.id)!.status).toBe('Passed');
	});
});

describe('startOnboardingStage', () => {
	test('GIVEN the time limit cannot be scheduled THEN the row does not wait with no deadline', async () => {
		createTask.mockRejectedValueOnce(new Error('Redis down'));

		await expect(startOnboardingStage(guildId, userId, createStage('1'))).rejects.toThrow('Redis down');
		expect([...table.values()].map((row) => row.status)).toEqual(['Left']);
	});
});

describe('advanceOnboardingLocked', () => {
	test('GIVEN a member who waits THEN the job of their time limit is scheduled again, should it be missing', async () => {
		const stage = createStage('1');
		const row = addRow({ createdAt: Date.now() - minute });

		expect(await advanceOnboardingLocked(createMember(), state.config)).toMatchObject({ kind: 'Waiting' });
		expect(scheduledJobIds()).toEqual([getOnboardingTimeLimitTaskId(row.id, deadlineOf(row, stage))]);
	});
});

describe('syncOnboardingTimeLimits', () => {
	test('GIVEN a time limit edited THEN the members who wait get the new deadline, and the rows of a deleted stage stop waiting', async () => {
		const shortened = createStage('1', { timeLimit: 300 });
		const added = createStage('2', { timeLimit: 120 });
		const removed = createStage('3', { timeLimit: 0 });
		setConfig([shortened, added, removed]);
		const first = addRow({ stageId: '1' });
		const second = addRow({ stageId: '2', userId: '1' });
		addRow({ stageId: '3', userId: '2' });
		const orphan = addRow({ stageId: null, userId: '3' });

		await syncOnboardingTimeLimits(guildId);
		expect(scheduledJobIds().sort()).toEqual(
			[
				getOnboardingTimeLimitTaskId(first.id, deadlineOf(first, shortened)),
				getOnboardingTimeLimitTaskId(second.id, deadlineOf(second, added))
			].sort()
		);
		expect(table.get(orphan.id)!.status).toBe('Left');
	});
});

describe('resumeOnboardingTimeLimits', () => {
	test('GIVEN the module switched on THEN the members who wait get their deadline again', async () => {
		const stage = createStage('1');
		const row = addRow();

		await resumeOnboardingTimeLimits(guildId, false, true);
		expect(scheduledJobIds()).toEqual([getOnboardingTimeLimitTaskId(row.id, deadlineOf(row, stage))]);
	});

	test.each([
		[true, true],
		[true, false],
		[false, false]
	])('GIVEN the module that was %s and is %s THEN no deadline is scheduled', async (previous, next) => {
		addRow();

		await resumeOnboardingTimeLimits(guildId, previous, next);
		expect(createTask).not.toHaveBeenCalled();
	});
});
