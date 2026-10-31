import { ModerationActions } from '#lib/moderation/actions/index';
import { scheduleJoinGuardTimeout } from '#lib/moderation/joinguard/checkpoint';
import { guardJoiningMember } from '#lib/moderation/joinguard/join';
import { recordSharedBan, sendJoinGuardLog } from '#lib/moderation/joinguard/log';
import { getJoinGuardRoleProblem, getJoinGuardTargetProblem, getMissingJoinGuardPermissions } from '#lib/moderation/joinguard/permissions';
import { readJoinGuardConfig } from '#lib/moderation/joinguard/store';
import type { JoinGuardLogEntry } from '#lib/moderation/joinguard/render';
import { DiscordSnowflake } from '@sapphire/snowflake';
import { container } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import {
	createJoinGuardCheckpoint,
	deleteJoinGuardCheckpoint,
	getDefaultGuildSettings,
	type JoinGuardRule,
	type JoinGuardSettings
} from 'wolfstar-database';
import { createRule, guildId } from './fixtures';

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	createJoinGuardCheckpoint: vi.fn(async (_db: unknown, _guild: string, data: { status: string }) => ({ id: '55', ...data })),
	deleteJoinGuardCheckpoint: vi.fn(async () => true)
}));
vi.mock('#lib/moderation/joinguard/store', () => ({
	readJoinGuardConfig: vi.fn(),
	withJoinGuardMemberLock: (_guild: string, _user: string, callback: () => Promise<unknown>) => callback()
}));
vi.mock('#lib/moderation/joinguard/checkpoint', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/joinguard/checkpoint')>()),
	scheduleJoinGuardTimeout: vi.fn(async () => undefined)
}));
vi.mock('#lib/moderation/actions/index', () => ({ ModerationActions: { kick: { apply: vi.fn() }, ban: { apply: vi.fn() } } }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/appeals', () => ({ shouldLinkAppeal: vi.fn(async () => false), getAppealUrl: vi.fn() }));
vi.mock('#lib/database', () => ({ fetchUserReportEnabled: vi.fn(async () => true) }));
vi.mock('#utils/functions', () => ({
	getModeration: vi.fn(async () => ({ createLock: () => () => undefined })),
	getStickyRoles: vi.fn(async () => ({ fetch: async () => stickyRoles }))
}));
vi.mock('#lib/moderation/joinguard/permissions', () => ({
	getMissingJoinGuardPermissions: vi.fn(async () => []),
	getMissingJoinGuardChannelPermissions: vi.fn(async () => []),
	getJoinGuardRoleProblem: vi.fn(async () => null),
	getJoinGuardTargetProblem: vi.fn(async () => null)
}));
vi.mock('#lib/moderation/joinguard/log', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/joinguard/log')>()),
	sendJoinGuardLog: vi.fn(),
	recordSharedBan: vi.fn(async () => undefined)
}));

let stickyRoles: string[] = [];
const now = Date.UTC(2026, 9, 27, 12);
const userId = DiscordSnowflake.generate({ timestamp: now - 3_600_000 }).toString();
const createMessage = vi.fn(async () => ({ id: '1' }));
const send = vi.fn(async () => undefined);
const guild = { id: guildId, name: 'Server' };

function createMember(roleIds: string[] = []) {
	const user = {
		id: userId,
		username: 'raider',
		globalName: null,
		avatar: null,
		bot: false,
		flags: { bitField: 0 },
		send,
		toJSON: () => ({ id: userId, username: 'raider', discriminator: '0', avatar: null, global_name: null })
	};
	return {
		guildId,
		user,
		fetchUser: async () => user,
		fetchGuild: async () => guild,
		roles: { ids: roleIds, add: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
	} as unknown as GuildMember & { roles: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } };
}

function configure(rules: JoinGuardRule[], overrides: Partial<JoinGuardSettings> = {}) {
	vi.mocked(readJoinGuardConfig).mockResolvedValue({
		settings: { ...getDefaultGuildSettings()!, joinGuardEnabled: true, joinGuardLogChannel: '900', ...overrides } as JoinGuardSettings,
		rules
	});
}

function readLog() {
	expect(sendJoinGuardLog).toHaveBeenCalledTimes(1);
	return vi.mocked(sendJoinGuardLog).mock.calls[0][3] as Extract<JoinGuardLogEntry, { kind: 'Stopped' }>;
}

beforeEach(() => {
	vi.clearAllMocks();
	stickyRoles = [];
	vi.mocked(ModerationActions.ban.apply).mockResolvedValue({ id: 9 } as never);
	vi.mocked(ModerationActions.kick.apply).mockResolvedValue({ id: 8 } as never);
	Object.assign(container, {
		prisma: {},
		logger: { error: vi.fn() },
		gatewayClient: { user: { id: '1' }, api: { channels: { createMessage } } }
	});
});

describe('guardJoiningMember', () => {
	const young = { accountAgeMax: 86_400 };

	test('GIVEN a member a ban rule matches THEN they are told once, banned as a case and put on the shared ban list', async () => {
		configure([createRule({ ...young, hardAction: 'Ban', directMessage: true, roleId: '100' })]);

		await guardJoiningMember(createMember(), now);

		expect(send).toHaveBeenCalledTimes(1);
		expect(ModerationActions.ban.apply).toHaveBeenCalledWith(
			guild,
			expect.objectContaining({ reason: 'events/join-guard:caseReason' }),
			expect.objectContaining({ sendDirectMessage: false })
		);
		expect(recordSharedBan).toHaveBeenCalledWith({ guildId, userId, caseId: 9, source: 'JoinGuard' });
		expect(createJoinGuardCheckpoint).toHaveBeenCalledWith({}, guildId, expect.objectContaining({ status: 'Banned', caseId: 9 }));
		expect(readLog()).toMatchObject({ outcome: { kind: 'Banned', caseId: 9 }, roles: [], directMessage: 'Sent' });
	});

	test('GIVEN a kick the bot has no permission for THEN nothing is taken and the log says what is missing', async () => {
		configure([createRule({ ...young, hardAction: 'Kick' })]);
		vi.mocked(getMissingJoinGuardPermissions).mockResolvedValueOnce(['KickMembers']);

		await guardJoiningMember(createMember(), now);

		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(readLog()).toMatchObject({ outcome: { kind: 'None' }, errors: ['events/join-guard:errorMissingPermissions'] });
	});

	test('GIVEN a member the bot cannot act on THEN they are not told they are removed, and nothing is taken', async () => {
		configure([createRule({ ...young, hardAction: 'Ban', directMessage: true })]);
		vi.mocked(getJoinGuardTargetProblem).mockResolvedValueOnce('moderation:actionTargetHigherHierarchyWolf');

		await guardJoiningMember(createMember(), now);

		expect(ModerationActions.ban.apply).not.toHaveBeenCalled();
		expect(recordSharedBan).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({ content: expect.not.stringContaining('directMessageBanned') });
		expect(readLog()).toMatchObject({ outcome: { kind: 'None' }, errors: ['events/join-guard:errorTarget'] });
	});

	test('GIVEN a member sent to the checkpoint THEN they get the pending role, wait in the queue and their timeout is scheduled', async () => {
		configure([createRule({ ...young, sendToCheckpoint: true })], { joinGuardCheckpoint: true, joinGuardPendingRole: '300' });
		const member = createMember();

		await guardJoiningMember(member, now);

		expect(member.roles.add).toHaveBeenCalledWith('300', 'events/join-guard:pendingRoleReason');
		expect(createJoinGuardCheckpoint).toHaveBeenCalledWith(
			{},
			guildId,
			expect.objectContaining({ status: 'Waiting', expiresAt: now + 86_400_000 })
		);
		expect(scheduleJoinGuardTimeout).toHaveBeenCalledWith('55', 86_400);
		expect(send).toHaveBeenCalledTimes(1);
		expect(readLog()).toMatchObject({ outcome: { kind: 'Checkpoint', expiresAt: now + 86_400_000 } });
	});

	describe('a checkpoint that cannot be set up', () => {
		const checkpoint = { joinGuardCheckpoint: true, joinGuardPendingRole: '300' } as const;
		const refused = () => Object.assign(new Error('Missing Permissions'), { code: 50013 });

		function expectNotStopped(member: ReturnType<typeof createMember>) {
			expect(scheduleJoinGuardTimeout).not.toHaveBeenCalled();
			expect(member.roles.ids).toEqual([]);
			expect(readLog()).toMatchObject({ outcome: { kind: 'None' }, errors: [expect.any(String)] });
			expect(send).toHaveBeenCalledWith({ content: expect.not.stringContaining('directMessageCheckpoint') });
		}

		test('GIVEN a pending role the bot cannot give THEN the member does not wait, the timeout would read them as let in', async () => {
			configure([createRule({ ...young, sendToCheckpoint: true })], checkpoint);
			vi.mocked(getJoinGuardRoleProblem).mockResolvedValueOnce('above');
			const member = createMember();

			await guardJoiningMember(member, now);

			expect(member.roles.add).not.toHaveBeenCalled();
			expect(createJoinGuardCheckpoint).not.toHaveBeenCalled();
			expectNotStopped(member);
		});

		test('GIVEN a pending role Discord refuses THEN the member does not wait either', async () => {
			configure([createRule({ ...young, sendToCheckpoint: true })], checkpoint);
			const member = createMember();
			member.roles.add.mockRejectedValueOnce(refused());

			await guardJoiningMember(member, now);

			expect(createJoinGuardCheckpoint).not.toHaveBeenCalled();
			expectNotStopped(member);
		});

		test('GIVEN a row that cannot be written THEN the pending role is taken back', async () => {
			configure([createRule({ ...young, sendToCheckpoint: true })], checkpoint);
			vi.mocked(createJoinGuardCheckpoint).mockRejectedValueOnce(new Error('connection lost'));
			const member = createMember();

			await guardJoiningMember(member, now);

			expect(member.roles.remove).toHaveBeenCalledWith('300', expect.any(String));
			expectNotStopped(member);
		});

		test('GIVEN a timeout that cannot be scheduled THEN the row goes and the pending role is taken back', async () => {
			configure([createRule({ ...young, sendToCheckpoint: true })], checkpoint);
			vi.mocked(scheduleJoinGuardTimeout).mockRejectedValueOnce(new Error('Connection is closed.'));
			const member = createMember();

			await guardJoiningMember(member, now);

			expect(deleteJoinGuardCheckpoint).toHaveBeenCalledWith({}, '55');
			expect(member.roles.remove).toHaveBeenCalledWith('300', expect.any(String));
			expect(readLog()).toMatchObject({ outcome: { kind: 'None' } });
		});

		test('GIVEN the same role as pending and verified THEN nobody is sent to the checkpoint', async () => {
			configure([createRule({ ...young, sendToCheckpoint: true })], { ...checkpoint, joinGuardVerifiedRole: '300' });
			const member = createMember();

			await guardJoiningMember(member, now);

			expect(member.roles.add).not.toHaveBeenCalled();
			expect(createJoinGuardCheckpoint).not.toHaveBeenCalled();
			expectNotStopped(member);
		});
	});

	test('GIVEN a timeout of 0 THEN the member waits with no job', async () => {
		configure([createRule({ ...young, sendToCheckpoint: true })], { joinGuardCheckpoint: true, joinGuardCheckpointTimeout: 0 });

		await guardJoiningMember(createMember(), now);

		expect(scheduleJoinGuardTimeout).not.toHaveBeenCalled();
		expect(readLog()).toMatchObject({ outcome: { kind: 'Checkpoint', expiresAt: null } });
	});

	test('GIVEN several rules THEN their roles and alerts all run', async () => {
		configure([
			createRule({ id: '1', ...young, roleId: '100', alertChannelId: '500' }),
			createRule({ id: '2', defaultAvatar: true, roleId: '200' })
		]);
		const member = createMember();

		await guardJoiningMember(member, now);

		expect(member.roles.add).toHaveBeenCalledTimes(2);
		expect(createMessage).toHaveBeenCalledWith('500', expect.objectContaining({ allowed_mentions: { parse: [] } }));
		expect(readLog()).toMatchObject({ roles: ['100', '200'], alerts: ['500'], directMessage: 'None' });
	});

	test('GIVEN an allowed role the member gets back from the sticky roles THEN the guard leaves them alone', async () => {
		configure([createRule({ ...young, hardAction: 'Ban' })], { joinGuardAllowedRoles: ['700'] });
		stickyRoles = ['700'];

		expect(await guardJoiningMember(createMember(), now)).toBeNull();
		expect(ModerationActions.ban.apply).not.toHaveBeenCalled();
	});

	test('GIVEN the guard off, or no rule that matches THEN nothing is done', async () => {
		configure([createRule({ ...young, hardAction: 'Ban' })], { joinGuardEnabled: false });
		expect(await guardJoiningMember(createMember(), now)).toBeNull();

		configure([createRule({ accountAgeMax: 60, hardAction: 'Ban' })]);
		expect(await guardJoiningMember(createMember(), now)).toBeNull();
		expect(sendJoinGuardLog).not.toHaveBeenCalled();
	});
});
