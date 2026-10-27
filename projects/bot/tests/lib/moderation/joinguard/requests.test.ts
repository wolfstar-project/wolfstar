import { admitJoinGuardMember, kickJoinGuardMember } from '#lib/moderation/joinguard/checkpoint';
import { handleJoinGuardRequest, parseJoinGuardRequest } from '#lib/moderation/joinguard/requests';
import { container } from '@wolfstar/http-framework';
import { setJoinGuardRequestError, type JoinGuardRequestRecord } from 'wolfstar-database';
import { guildId } from './fixtures';

// The requests, in place of the table, claimed as the database does: once, by whoever marks them first.
const { requests, processed } = vi.hoisted(() => ({ requests: new Map<string, unknown>(), processed: new Set<string>() }));

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	claimJoinGuardRequest: vi.fn(async (_db: unknown, id: string) => {
		if (processed.has(id) || !requests.has(id)) return null;
		processed.add(id);
		return requests.get(id);
	}),
	setJoinGuardRequestError: vi.fn(async () => undefined)
}));
vi.mock('#lib/moderation/joinguard/checkpoint', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/joinguard/checkpoint')>()),
	admitJoinGuardMember: vi.fn(async () => ({ ok: true, value: {} })),
	kickJoinGuardMember: vi.fn(async () => ({ ok: true, value: { caseId: 1 } }))
}));
vi.mock('#lib/moderation/joinguard/button', () => ({ postJoinGuardButton: vi.fn(async () => ({ ok: true, value: {} })) }));

function record(overrides: Partial<JoinGuardRequestRecord> = {}): JoinGuardRequestRecord {
	return {
		id: '5',
		guildId,
		kind: 'Pass',
		userId: '10',
		checkpointId: '3',
		moderatorId: null,
		trust: 2,
		linkedAccounts: 1,
		reason: null,
		createdAt: 0,
		...overrides
	};
}

describe('parseJoinGuardRequest', () => {
	test('GIVEN a pass THEN it carries the member, the row and what the page measured', () => {
		expect(parseJoinGuardRequest(record())).toEqual({
			ok: true,
			value: { kind: 'Pass', guildId, userId: '10', checkpointId: '3', trust: 2, linkedAccounts: 1 }
		});
	});

	test.each([
		['no member', { userId: null }],
		['no trust', { trust: null }],
		['a trust above the scale', { trust: 4 }],
		['a negative count of accounts', { linkedAccounts: -1 }]
	])('GIVEN a pass with %s THEN it is refused', (_, overrides) => {
		expect(parseJoinGuardRequest(record(overrides))).toMatchObject({ ok: false, error: { code: 'InvalidRequest' } });
	});

	test('GIVEN a verification or a kick without the moderator THEN it is refused', () => {
		expect(parseJoinGuardRequest(record({ kind: 'Verify' }))).toMatchObject({ ok: false, error: { code: 'InvalidRequest' } });
		expect(parseJoinGuardRequest(record({ kind: 'Kick', moderatorId: null }))).toMatchObject({ ok: false });
	});

	test('GIVEN a kick THEN its reason is trimmed and cut, an empty one is none', () => {
		const long = parseJoinGuardRequest(record({ kind: 'Kick', moderatorId: '7', reason: ` ${'a'.repeat(600)} ` }));
		const empty = parseJoinGuardRequest(record({ kind: 'Kick', moderatorId: '7', reason: '   ' }));

		expect(long.ok && long.value.kind === 'Kick' && long.value.reason?.length).toBe(500);
		expect(empty).toMatchObject({ ok: true, value: { reason: null } });
	});
});

describe('handleJoinGuardRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requests.clear();
		processed.clear();
		Object.assign(container, { prisma: {}, logger: { error: vi.fn() } });
	});

	test('GIVEN a request brought twice THEN it is done once', async () => {
		requests.set('5', record());

		expect(await Promise.all([handleJoinGuardRequest('5'), handleJoinGuardRequest('5')])).toEqual(['Done', 'Claimed']);
		expect(admitJoinGuardMember).toHaveBeenCalledTimes(1);
		expect(admitJoinGuardMember).toHaveBeenCalledWith(guildId, '10', { kind: 'Checkpoint', trust: 2, linkedAccounts: 1, checkpointId: '3' });
	});

	test('GIVEN a request that cannot be done THEN why is written to it', async () => {
		requests.set('5', record({ kind: 'Kick', moderatorId: '7' }));
		vi.mocked(kickJoinGuardMember).mockResolvedValueOnce({ ok: false, error: { code: 'NotMember', detail: 'The member is not in the guild.' } });

		expect(await handleJoinGuardRequest('5')).toBe('Failed');
		expect(setJoinGuardRequestError).toHaveBeenCalledWith(container.prisma, '5', 'NotMember: The member is not in the guild.');
	});

	test('GIVEN a request that is not valid THEN it is not run, and why is written to it', async () => {
		requests.set('5', record({ trust: null }));

		expect(await handleJoinGuardRequest('5')).toBe('Failed');
		expect(admitJoinGuardMember).not.toHaveBeenCalled();
		expect(vi.mocked(setJoinGuardRequestError).mock.calls[0][2]).toMatch(/^InvalidRequest: /);
	});

	test('GIVEN a request that throws THEN it is logged and marked as failed', async () => {
		requests.set('5', record());
		vi.mocked(admitJoinGuardMember).mockRejectedValueOnce(new Error('boom'));

		expect(await handleJoinGuardRequest('5')).toBe('Failed');
		expect(container.logger.error).toHaveBeenCalledTimes(1);
		expect(vi.mocked(setJoinGuardRequestError).mock.calls[0][2]).toMatch(/^Failed: /);
	});
});
