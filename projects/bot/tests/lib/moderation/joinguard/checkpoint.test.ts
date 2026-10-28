import { ModerationActions } from '#lib/moderation/actions/index';
import { admitJoinGuardMember, kickJoinGuardMember, leaveJoinGuardMember, runJoinGuardTimeout } from '#lib/moderation/joinguard/checkpoint';
import { sendJoinGuardLog } from '#lib/moderation/joinguard/log';
import { getJoinGuardRoleProblem, getJoinGuardTargetProblem } from '#lib/moderation/joinguard/permissions';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { getDefaultGuildSettings, type JoinGuardCheckpoint, type JoinGuardCheckpointResolveData } from 'wolfstar-database';
import { guildId } from './fixtures';

// The queue of the dashboard, in place of the table, with what the database guarantees: a row is resolved while it waits.
const { table, settings } = vi.hoisted(() => ({
	table: new Map<string, JoinGuardCheckpoint>(),
	settings: { current: {} as Record<string, unknown> }
}));

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchTableSettings: vi.fn(async () => settings.current),
	fetchJoinGuardCheckpoint: vi.fn(async (_orm: unknown, id: string) => table.get(id) ?? null),
	fetchWaitingJoinGuardCheckpoint: vi.fn(
		async (_orm: unknown, guild: string, user: string) =>
			[...table.values()].find((row) => row.guildId === guild && row.userId === user && row.status === 'Waiting') ?? null
	),
	resolveJoinGuardCheckpoint: vi.fn(async (_db: unknown, id: string, data: JoinGuardCheckpointResolveData) => {
		const row = table.get(id);
		if (row?.status !== 'Waiting') return false;
		table.set(id, { ...row, ...data, moderatorId: data.moderatorId ?? null, caseId: data.caseId ?? null } as JoinGuardCheckpoint);
		return true;
	}),
	reopenJoinGuardCheckpoint: vi.fn(async (_db: unknown, id: string, status: string) => {
		const row = table.get(id);
		if (row?.status !== status) return false;
		table.set(id, { ...row, status: 'Waiting', resolution: null, caseId: null });
		return true;
	}),
	setJoinGuardCheckpointCase: vi.fn(async (_db: unknown, id: string, caseId: number) => {
		table.set(id, { ...table.get(id)!, caseId });
	}),
	leaveJoinGuardCheckpoints: vi.fn(async (_db: unknown, guild: string, user: string) => {
		const left: JoinGuardCheckpoint[] = [];
		for (const row of table.values()) {
			if (row.guildId !== guild || row.userId !== user || row.status !== 'Waiting') continue;
			table.set(row.id, { ...row, status: 'Left' });
			left.push(row);
		}
		return left;
	})
}));
vi.mock('#lib/moderation/actions/index', () => ({ ModerationActions: { kick: { apply: vi.fn() } } }));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/database', () => ({ fetchUserReportEnabled: vi.fn(async () => true) }));
vi.mock('#utils/functions', () => ({ getModeration: vi.fn(async () => ({ createLock: () => () => undefined })) }));
vi.mock('#lib/moderation/joinguard/permissions', () => ({
	getMissingJoinGuardPermissions: vi.fn(async () => []),
	getJoinGuardRoleProblem: vi.fn(async () => null),
	getJoinGuardTargetProblem: vi.fn(async () => null)
}));
vi.mock('#lib/moderation/joinguard/log', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/joinguard/log')>()),
	sendJoinGuardLog: vi.fn()
}));

const userId = '266624760782258186';
const pendingRole = '300';
const verifiedRole = '400';
const guild = { id: guildId, name: 'Server' } as unknown as Guild;
const unknownMember = () => new DiscordAPIError({ code: 10007, message: 'Unknown Member' }, 10007, 404, 'GET', 'https://discord.com', {});

let member: { roleIds: string[] } | null;
const fetchMember = vi.fn();
const deleteTask = vi.fn(async () => undefined);

// What Discord refuses, by the role call:
let refuse: { add?: string; remove?: string } = {};

function createMember(roleIds: string[]) {
	const user = { id: userId, toJSON: () => ({ id: userId, username: 'raider', discriminator: '0', avatar: null, global_name: null }) };
	const refused = () => new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'PUT', 'https://discord.com', {});
	// The member the API returns is a snapshot, the roles it changes are the ones of the member in the guild:
	return {
		user,
		fetchUser: async () => user,
		roles: {
			ids: [...roleIds],
			add: vi.fn(async (roleId: string) => {
				if (refuse.add === roleId) throw refused();
				if (!member!.roleIds.includes(roleId)) member!.roleIds.push(roleId);
			}),
			remove: vi.fn(async (roleId: string) => {
				if (refuse.remove === roleId) throw refused();
				member!.roleIds = member!.roleIds.filter((id) => id !== roleId);
			})
		}
	};
}

function addRow(overrides: Partial<JoinGuardCheckpoint> = {}): JoinGuardCheckpoint {
	const row: JoinGuardCheckpoint = {
		id: String(table.size + 1),
		guildId,
		userId,
		ruleId: '1',
		ruleName: 'New accounts',
		status: 'Waiting',
		resolution: null,
		moderatorId: null,
		caseId: null,
		accountCreatedAt: 0,
		defaultAvatar: true,
		generatedName: false,
		trust: null,
		linkedAccounts: 0,
		createdAt: Date.UTC(2026, 9, 26),
		expiresAt: Date.UTC(2026, 9, 27),
		resolvedAt: null,
		...overrides
	};
	table.set(row.id, row);
	return row;
}

beforeEach(() => {
	vi.clearAllMocks();
	table.clear();
	settings.current = {
		...getDefaultGuildSettings()!,
		joinGuardPendingRole: pendingRole,
		joinGuardVerifiedRole: verifiedRole,
		joinGuardLogChannel: '900'
	};
	member = { roleIds: [pendingRole] };
	refuse = {};
	fetchMember.mockImplementation(async () => {
		if (member === null) throw unknownMember();
		return createMember(member.roleIds);
	});
	vi.mocked(ModerationActions.kick.apply).mockResolvedValue({ id: 42 } as never);
	Object.assign(container, {
		prisma: { orm: {} },
		redis: undefined,
		tasks: { delete: deleteTask },
		logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
		gatewayClient: {
			guilds: { resolve: vi.fn(async () => guild) },
			members: { fetch: fetchMember },
			users: { fetch: vi.fn(async () => ({ id: '1', toJSON: () => ({}) })) }
		}
	});
});

describe('runJoinGuardTimeout', () => {
	test('GIVEN a member who still waits with the pending role THEN they are kicked as a case and the row says why', async () => {
		const row = addRow();

		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Kicked', caseId: 42 });
		expect(ModerationActions.kick.apply).toHaveBeenCalledWith(
			guild,
			expect.objectContaining({ reason: 'events/join-guard:caseTimeoutReason' }),
			expect.anything()
		);
		expect(table.get(row.id)).toMatchObject({ status: 'Kicked', resolution: 'Timeout', caseId: 42 });
		expect(sendJoinGuardLog).toHaveBeenCalledWith(guild, '900', expect.anything(), { kind: 'TimedOut', caseId: 42 });
	});

	test('GIVEN a member who was verified before the job THEN nothing is done', async () => {
		const row = addRow({ status: 'Verified', resolution: 'Checkpoint' });

		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Resolved' });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Verified');
	});

	test('GIVEN a member who left THEN they are not kicked, and the row says they left', async () => {
		const row = addRow();
		member = null;

		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Left' });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Left');
	});

	test('GIVEN a member who left and joined again THEN the job of the first stay does not kick them', async () => {
		const first = addRow();
		await leaveJoinGuardMember(guild, userId);
		const second = addRow();

		expect(await runJoinGuardTimeout(first.id)).toEqual({ kind: 'Resolved' });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(second.id)!.status).toBe('Waiting');
	});

	test('GIVEN a member whose pending role a moderator took away by hand THEN they were let in, not kicked', async () => {
		const row = addRow();
		member = { roleIds: [] };

		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'LetIn' });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)).toMatchObject({ status: 'Verified', resolution: 'Moderator', moderatorId: null });
	});

	test('GIVEN a member who got the verified role by hand THEN they were let in too', async () => {
		const row = addRow();
		member = { roleIds: [pendingRole, verifiedRole] };

		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'LetIn' });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
	});

	test('GIVEN a kick Discord refuses THEN the member waits again and the log says why', async () => {
		const row = addRow();
		const error = new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'DELETE', 'https://discord.com', {});
		vi.mocked(ModerationActions.kick.apply).mockRejectedValue(error);

		expect(await runJoinGuardTimeout(row.id)).toMatchObject({ kind: 'Failed' });
		expect(table.get(row.id)!.status).toBe('Waiting');
		expect(sendJoinGuardLog).toHaveBeenCalledWith(guild, '900', expect.anything(), { kind: 'Failed', errors: [expect.any(String)] });
	});

	test('GIVEN the same job twice THEN the member is kicked once', async () => {
		const row = addRow();

		await runJoinGuardTimeout(row.id);
		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Resolved' });
		expect(ModerationActions.kick.apply).toHaveBeenCalledTimes(1);
	});
});

describe('admitJoinGuardMember', () => {
	test('GIVEN a member who passed the page THEN the roles change, the row stores what it measured and the timeout goes', async () => {
		const row = addRow();
		const admitted = await admitJoinGuardMember(guildId, userId, { kind: 'Checkpoint', trust: 2, linkedAccounts: 3, checkpointId: row.id });

		expect(admitted).toEqual({ ok: true, value: { checkpoint: row, changedRoles: true } });
		expect(table.get(row.id)).toMatchObject({ status: 'Verified', resolution: 'Checkpoint', trust: 2, linkedAccounts: 3 });
		expect(deleteTask).toHaveBeenCalledWith(`joinguard-checkpoint-${row.id}`);
	});

	test('GIVEN a pass for a member who does not wait THEN it is refused, and the timeout then still finds nothing to do', async () => {
		const row = addRow({ status: 'Kicked', resolution: 'Timeout' });
		const admitted = await admitJoinGuardMember(guildId, userId, { kind: 'Checkpoint', trust: 2, linkedAccounts: 0, checkpointId: null });

		expect(admitted).toMatchObject({ ok: false, error: { code: 'NotWaiting' } });
		expect(table.get(row.id)!.status).toBe('Kicked');
	});

	test('GIVEN the verified role cannot be given THEN the member keeps the pending role, waits, and the timeout kicks them', async () => {
		const row = addRow();
		refuse = { add: verifiedRole };

		const admitted = await admitJoinGuardMember(guildId, userId, { kind: 'Checkpoint', trust: 2, linkedAccounts: 0, checkpointId: row.id });

		expect(admitted).toMatchObject({ ok: false, error: { code: 'Refused' } });
		expect(member!.roleIds).toEqual([pendingRole]);
		expect(table.get(row.id)!.status).toBe('Waiting');
		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Kicked', caseId: 42 });
	});

	test('GIVEN the pending role cannot be taken THEN the verified role is taken back, and the member still waits', async () => {
		const row = addRow();
		refuse = { remove: pendingRole };

		const admitted = await admitJoinGuardMember(guildId, userId, { kind: 'Moderator', moderatorId: '77' });

		expect(admitted).toMatchObject({ ok: false, error: { code: 'Refused' } });
		expect(member!.roleIds).toEqual([pendingRole]);
		expect(table.get(row.id)!.status).toBe('Waiting');
		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Kicked', caseId: 42 });
	});

	test('GIVEN the same role is pending and verified THEN nobody is let in by it, and the timeout still kicks', async () => {
		settings.current = { ...settings.current, joinGuardVerifiedRole: pendingRole };
		const row = addRow();

		expect(await admitJoinGuardMember(guildId, userId, { kind: 'Moderator', moderatorId: '77' })).toMatchObject({
			ok: false,
			error: { code: 'RoleNotManageable' }
		});
		expect(member!.roleIds).toEqual([pendingRole]);
		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Kicked', caseId: 42 });
	});

	test('GIVEN a moderator THEN a member the guard never stopped is let in too', async () => {
		member = { roleIds: [] };
		const admitted = await admitJoinGuardMember(guildId, userId, { kind: 'Moderator', moderatorId: '77' });

		expect(admitted).toEqual({ ok: true, value: { checkpoint: null, changedRoles: true } });
	});

	test('GIVEN a role the bot cannot manage THEN the member keeps waiting and the problem is told', async () => {
		const row = addRow();
		vi.mocked(getJoinGuardRoleProblem).mockResolvedValueOnce('above');

		const admitted = await admitJoinGuardMember(guildId, userId, { kind: 'Moderator', moderatorId: '77' });

		expect(admitted).toMatchObject({ ok: false, error: { code: 'RoleNotManageable' } });
		expect(table.get(row.id)!.status).toBe('Waiting');
	});

	test('GIVEN the moderator verifies before the timeout THEN the timeout does not kick', async () => {
		const row = addRow();

		await admitJoinGuardMember(guildId, userId, { kind: 'Moderator', moderatorId: '77' });

		expect(await runJoinGuardTimeout(row.id)).toEqual({ kind: 'Resolved' });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)).toMatchObject({ status: 'Verified', resolution: 'Moderator', moderatorId: '77' });
	});
});

describe('kickJoinGuardMember', () => {
	test('GIVEN a member who waits THEN they are kicked in the name of the moderator and the row is resolved', async () => {
		const row = addRow();

		expect(await kickJoinGuardMember(guildId, userId, '77', 'Raid')).toEqual({ ok: true, value: { caseId: 42 } });
		expect(ModerationActions.kick.apply).toHaveBeenCalledWith(
			guild,
			expect.objectContaining({ reason: 'Raid', moderator: '77' }),
			expect.anything()
		);
		expect(table.get(row.id)).toMatchObject({ status: 'Kicked', resolution: 'Moderator', moderatorId: '77', caseId: 42 });
	});

	test('GIVEN a member above the moderator who asked THEN they are not kicked, and still wait', async () => {
		const row = addRow();
		vi.mocked(getJoinGuardTargetProblem).mockResolvedValueOnce('moderation:actionTargetHigherHierarchyAuthor');

		expect(await kickJoinGuardMember(guildId, userId, '77', null)).toEqual({
			ok: false,
			error: { code: 'NotAllowed', detail: 'moderation:actionTargetHigherHierarchyAuthor' }
		});
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(table.get(row.id)!.status).toBe('Waiting');
	});

	test('GIVEN a member who left THEN nothing is done and the request says so', async () => {
		member = null;

		expect(await kickJoinGuardMember(guildId, userId, '77', null)).toMatchObject({ ok: false, error: { code: 'NotMember' } });
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
	});
});
