import { postJoinGuardButton } from '#lib/moderation/joinguard/button';
import {
	admitJoinGuardMember,
	joinGuardErr,
	joinGuardOk,
	kickJoinGuardMember,
	type JoinGuardFailure,
	type JoinGuardResult
} from '#lib/moderation/joinguard/checkpoint';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { SharedLockReleaseScript } from '#utils/locks';
import { randomUUID } from 'node:crypto';
import {
	completeJoinGuardRequest,
	fetchPendingJoinGuardRequestIds,
	fetchUnprocessedJoinGuardRequest,
	JoinGuardTrustLimits,
	MaximumJoinGuardReasonLength,
	type JoinGuardRequestRecord
} from 'wolfstar-database';

/**
 * A request of the website, read from its row and checked: each kind has what it needs, and nothing else is trusted.
 */
export type JoinGuardRequest =
	| {
			readonly kind: 'Pass';
			readonly guildId: Snowflake;
			readonly userId: Snowflake;
			readonly checkpointId: string | null;
			readonly trust: number;
			readonly linkedAccounts: number;
			readonly requestedAt: number;
	  }
	| {
			readonly kind: 'Verify';
			readonly guildId: Snowflake;
			readonly userId: Snowflake;
			readonly moderatorId: Snowflake;
			readonly requestedAt: number;
	  }
	| {
			readonly kind: 'Kick';
			readonly guildId: Snowflake;
			readonly userId: Snowflake;
			readonly moderatorId: Snowflake;
			readonly reason: string | null;
			readonly requestedAt: number;
	  }
	| { readonly kind: 'PostButton'; readonly guildId: Snowflake; readonly moderatorId: Snowflake | null };

function isCount(value: number | null): value is number {
	return value !== null && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reads a request of the website: `Pass` needs the member and what the page measured, `Verify` and `Kick` the member
 * and the moderator, and `PostButton` nothing.
 *
 * @param record - The request as it is stored.
 */
export function parseJoinGuardRequest(record: JoinGuardRequestRecord): JoinGuardResult<JoinGuardRequest> {
	// A request only acts on the stay of the member it was made for, see `joinedSince` of the checkpoint:
	const { guildId, userId, moderatorId, createdAt: requestedAt } = record;
	switch (record.kind) {
		case 'Pass': {
			if (userId === null) return joinGuardErr('InvalidRequest', 'A pass needs the member.');
			const { trust, linkedAccounts } = record;
			if (!isCount(trust) || trust < JoinGuardTrustLimits.minimum || trust > JoinGuardTrustLimits.maximum) {
				return joinGuardErr(
					'InvalidRequest',
					`A pass needs a trust from ${JoinGuardTrustLimits.minimum} to ${JoinGuardTrustLimits.maximum}.`
				);
			}
			if (linkedAccounts !== null && !isCount(linkedAccounts)) return joinGuardErr('InvalidRequest', 'The linked accounts are a count.');
			return joinGuardOk({
				kind: 'Pass',
				guildId,
				userId,
				checkpointId: record.checkpointId,
				trust,
				linkedAccounts: linkedAccounts ?? 0,
				requestedAt
			});
		}
		case 'Verify':
		case 'Kick': {
			if (userId === null) return joinGuardErr('InvalidRequest', `A ${record.kind.toLowerCase()} needs the member.`);
			if (moderatorId === null) return joinGuardErr('InvalidRequest', `A ${record.kind.toLowerCase()} needs the moderator.`);
			if (record.kind === 'Verify') return joinGuardOk({ kind: 'Verify', guildId, userId, moderatorId, requestedAt });

			const reason = record.reason?.trim() || null;
			return joinGuardOk({
				kind: 'Kick',
				guildId,
				userId,
				moderatorId,
				reason: reason === null ? null : cutText(reason, MaximumJoinGuardReasonLength),
				requestedAt
			});
		}
		case 'PostButton':
			return joinGuardOk({ kind: 'PostButton', guildId, moderatorId });
	}
}

/**
 * Does what a request asks.
 */
async function runJoinGuardRequest(request: JoinGuardRequest): Promise<JoinGuardResult<unknown>> {
	switch (request.kind) {
		case 'Pass':
			return admitJoinGuardMember(
				request.guildId,
				request.userId,
				{
					kind: 'Checkpoint',
					trust: request.trust,
					linkedAccounts: request.linkedAccounts,
					checkpointId: request.checkpointId
				},
				request.requestedAt
			);
		case 'Verify':
			return admitJoinGuardMember(
				request.guildId,
				request.userId,
				{ kind: 'Moderator', moderatorId: request.moderatorId },
				request.requestedAt
			);
		case 'Kick':
			return kickJoinGuardMember(request.guildId, request.userId, request.moderatorId, request.reason, request.requestedAt);
		case 'PostButton':
			return postJoinGuardButton(request.guildId, request.moderatorId ?? container.gatewayClient.user!.id);
	}
}

/**
 * The text the `error` column of a request holds, which the website shows: `<code>: <detail>`.
 */
function formatJoinGuardFailure(failure: JoinGuardFailure): string {
	return `${failure.code}: ${failure.detail}`;
}

/**
 * What became of a request this process was given.
 */
export type JoinGuardRequestOutcome = 'Claimed' | 'Done' | 'Failed';

/**
 * How long a process holds a request it handles, in milliseconds: one that stops meanwhile leaves it to the sweep of
 * another once this ran out.
 */
const RequestLeaseDuration = 120_000;

/**
 * The requests this process holds while Redis cannot be asked, see {@linkcode leaseJoinGuardRequest}.
 */
const localLeases = new Set<string>();

/**
 * Takes a request for this process, so its notification, a sweep and another process do not handle it at once.
 *
 * @remarks The lease is in Redis and runs out on its own, so a process that stops while it holds one does not keep
 * the request from being done: its `processed_at` is still not set. Without a connection, or when Redis fails, the
 * process keeps the lease itself, which is all a single process needs.
 *
 * @returns What gives the request back, `null` when another handler holds it.
 */
async function leaseJoinGuardRequest(requestId: string): Promise<(() => Promise<void>) | null> {
	const { redis } = container;
	if (redis?.status === 'ready') {
		const key = `wolfstar:joinguard:request:${requestId}`;
		const token = randomUUID();
		try {
			if ((await redis.set(key, token, 'PX', RequestLeaseDuration, 'NX')) === null) return null;
			return async () => {
				await redis
					.eval(SharedLockReleaseScript, 1, key, token)
					.catch((error: unknown) => container.logger.error(`[JoinGuard] Could not give the request ${requestId} back:`, error));
			};
		} catch (error) {
			container.logger.error(`[JoinGuard] Could not take the request ${requestId} in Redis:`, error);
		}
	}

	if (localLeases.has(requestId)) return null;
	localLeases.add(requestId);
	return async () => {
		localLeases.delete(requestId);
	};
}

/**
 * Handles a request of the website once, whatever brought it (its notification, a sweep, another process): it is
 * leased, read again while it is not done, done, and then marked done with why it could not be, in one write.
 *
 * @remarks A request that was taken by a process that stopped before marking it is done again by a sweep: what it asks
 * is safe to do twice, since every change of a member is made only while their row still waits.
 *
 * @param requestId - The ID of the request.
 * @returns `Claimed` when another handler has it, or had it done.
 */
export async function handleJoinGuardRequest(requestId: string): Promise<JoinGuardRequestOutcome> {
	const release = await leaseJoinGuardRequest(requestId);
	if (release === null) return 'Claimed';

	try {
		const record = await fetchUnprocessedJoinGuardRequest(container.prisma.orm, requestId);
		if (record === null) return 'Claimed';

		let result: JoinGuardResult<unknown>;
		try {
			const parsed = parseJoinGuardRequest(record);
			result = parsed.ok ? await runJoinGuardRequest(parsed.value) : parsed;
		} catch (error) {
			container.logger.error(`[JoinGuard] Could not handle the request ${requestId}:`, error);
			result = joinGuardErr('Failed', 'Something went wrong, it was logged.');
		}

		await completeJoinGuardRequest(container.prisma, requestId, result.ok ? null : formatJoinGuardFailure(result.error));
		return result.ok ? 'Done' : 'Failed';
	} finally {
		await release();
	}
}

/**
 * How old a request nobody claimed is before a sweep takes it, in milliseconds: a newer one is left to its notification.
 */
const JoinGuardSweepDelay = 5000;

/**
 * How many requests a sweep takes at most.
 */
const SweepLimit = 50;

/**
 * Reads the requests a sweep takes: the ones nobody claimed for {@linkcode JoinGuardSweepDelay}, whose notification was
 * lost or came while the bot was not listening.
 */
export function fetchJoinGuardRequestsToSweep(now = Date.now()): Promise<string[]> {
	return fetchPendingJoinGuardRequestIds(container.prisma.orm, now - JoinGuardSweepDelay, SweepLimit);
}
