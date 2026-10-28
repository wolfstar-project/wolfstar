import { admitJoinGuardMember, kickJoinGuardMember } from '#lib/moderation/joinguard/checkpoint';
import { handleJoinGuardRequest, parseJoinGuardRequest } from '#lib/moderation/joinguard/requests';
import { container } from '@wolfstar/http-framework';
import type { JoinGuardRequestRecord } from 'wolfstar-database';
import { guildId } from './fixtures';

// The requests, in place of the table: one is done when it has `processedAt`, which is only set once it was handled.
const { requests, processed } = vi.hoisted(() => ({ requests: new Map<string, unknown>(), processed: new Map<string, string | null>() }));

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchUnprocessedJoinGuardRequest: vi.fn(async (_orm: unknown, id: string) => (processed.has(id) ? null : (requests.get(id) ?? null))),
	completeJoinGuardRequest: vi.fn(async (_db: unknown, id: string, error: string | null) => {
		if (processed.has(id)) return false;
		processed.set(id, error);
		return true;
	})
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
		Object.assign(container, { prisma: {}, redis: undefined, logger: { error: vi.fn() } });
	});

	test('GIVEN a request brought twice at once THEN it is done once', async () => {
		requests.set('5', record());

		expect((await Promise.all([handleJoinGuardRequest('5'), handleJoinGuardRequest('5')])).sort()).toEqual(['Claimed', 'Done']);
		expect(admitJoinGuardMember).toHaveBeenCalledTimes(1);
		expect(admitJoinGuardMember).toHaveBeenCalledWith(guildId, '10', { kind: 'Checkpoint', trust: 2, linkedAccounts: 1, checkpointId: '3' });
		expect(processed.get('5')).toBeNull();
	});

	test('GIVEN a request being done THEN it is not marked done before, so a process that stops meanwhile loses nothing', async () => {
		requests.set('5', record());
		vi.mocked(admitJoinGuardMember).mockImplementationOnce(async () => {
			expect(processed.has('5')).toBe(false);
			return { ok: true, value: { checkpoint: null, changedRoles: false } };
		});

		expect(await handleJoinGuardRequest('5')).toBe('Done');
		expect(processed.has('5')).toBe(true);
	});

	test('GIVEN a request another process holds THEN it is left to it', async () => {
		requests.set('5', record());
		Object.assign(container, { redis: { status: 'ready', set: vi.fn(async () => null), eval: vi.fn() } });

		expect(await handleJoinGuardRequest('5')).toBe('Claimed');
		expect(admitJoinGuardMember).not.toHaveBeenCalled();
	});

	test('GIVEN a request that was done THEN a notification or a sweep that brings it again does nothing', async () => {
		requests.set('5', record());
		await handleJoinGuardRequest('5');

		expect(await handleJoinGuardRequest('5')).toBe('Claimed');
		expect(admitJoinGuardMember).toHaveBeenCalledTimes(1);
	});

	test('GIVEN a request that cannot be done THEN why is written to it', async () => {
		requests.set('5', record({ kind: 'Kick', moderatorId: '7' }));
		vi.mocked(kickJoinGuardMember).mockResolvedValueOnce({ ok: false, error: { code: 'NotMember', detail: 'The member is not in the guild.' } });

		expect(await handleJoinGuardRequest('5')).toBe('Failed');
		expect(processed.get('5')).toBe('NotMember: The member is not in the guild.');
	});

	test('GIVEN a request that is not valid THEN it is not run, and why is written to it', async () => {
		requests.set('5', record({ trust: null }));

		expect(await handleJoinGuardRequest('5')).toBe('Failed');
		expect(admitJoinGuardMember).not.toHaveBeenCalled();
		expect(processed.get('5')).toMatch(/^InvalidRequest: /);
	});

	test('GIVEN a request that throws THEN it is logged and marked as failed', async () => {
		requests.set('5', record());
		vi.mocked(admitJoinGuardMember).mockRejectedValueOnce(new Error('boom'));

		expect(await handleJoinGuardRequest('5')).toBe('Failed');
		expect(container.logger.error).toHaveBeenCalledTimes(1);
		expect(processed.get('5')).toMatch(/^Failed: /);
	});
});
