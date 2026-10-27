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
import {
	claimJoinGuardRequest,
	fetchPendingJoinGuardRequestIds,
	JoinGuardTrustLimits,
	MaximumJoinGuardReasonLength,
	setJoinGuardRequestError,
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
	  }
	| { readonly kind: 'Verify'; readonly guildId: Snowflake; readonly userId: Snowflake; readonly moderatorId: Snowflake }
	| {
			readonly kind: 'Kick';
			readonly guildId: Snowflake;
			readonly userId: Snowflake;
			readonly moderatorId: Snowflake;
			readonly reason: string | null;
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
	const { guildId, userId, moderatorId } = record;
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
			return joinGuardOk({ kind: 'Pass', guildId, userId, checkpointId: record.checkpointId, trust, linkedAccounts: linkedAccounts ?? 0 });
		}
		case 'Verify':
		case 'Kick': {
			if (userId === null) return joinGuardErr('InvalidRequest', `A ${record.kind.toLowerCase()} needs the member.`);
			if (moderatorId === null) return joinGuardErr('InvalidRequest', `A ${record.kind.toLowerCase()} needs the moderator.`);
			if (record.kind === 'Verify') return joinGuardOk({ kind: 'Verify', guildId, userId, moderatorId });

			const reason = record.reason?.trim() || null;
			return joinGuardOk({
				kind: 'Kick',
				guildId,
				userId,
				moderatorId,
				reason: reason === null ? null : cutText(reason, MaximumJoinGuardReasonLength)
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
			return admitJoinGuardMember(request.guildId, request.userId, {
				kind: 'Checkpoint',
				trust: request.trust,
				linkedAccounts: request.linkedAccounts,
				checkpointId: request.checkpointId
			});
		case 'Verify':
			return admitJoinGuardMember(request.guildId, request.userId, { kind: 'Moderator', moderatorId: request.moderatorId });
		case 'Kick':
			return kickJoinGuardMember(request.guildId, request.userId, request.moderatorId, request.reason);
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
 * Handles a request of the website: it is claimed first, so it is done once whatever brought it (its notification, a
 * sweep, another process), then done, and why it could not be is written to it.
 *
 * @param requestId - The ID of the request.
 * @returns `Claimed` when another handler had it already.
 */
export async function handleJoinGuardRequest(requestId: string): Promise<JoinGuardRequestOutcome> {
	const record = await claimJoinGuardRequest(container.prisma, requestId);
	if (record === null) return 'Claimed';

	let result: JoinGuardResult<unknown>;
	try {
		const parsed = parseJoinGuardRequest(record);
		result = parsed.ok ? await runJoinGuardRequest(parsed.value) : parsed;
	} catch (error) {
		container.logger.error(`[JoinGuard] Could not handle the request ${requestId}:`, error);
		result = joinGuardErr('Failed', 'Something went wrong, it was logged.');
	}

	if (result.ok) return 'Done';

	await setJoinGuardRequestError(container.prisma, requestId, formatJoinGuardFailure(result.error));
	return 'Failed';
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
