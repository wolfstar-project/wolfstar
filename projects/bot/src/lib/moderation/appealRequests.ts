import { hasAppealAccess } from '#lib/moderation/appealAccess';
import { updateAppealMessage } from '#lib/moderation/appealCommands';
import { settleAppeal, type AppealSettleError } from '#lib/moderation/appealService';
import { leaseRequest } from '#utils/requestQueue';
import { container } from '@wolfstar/http-framework';
import {
	completeAppealRequest,
	createAppealBlock,
	deleteAppealBlock,
	fetchAppeal,
	fetchPendingAppealRequestIds,
	fetchUnprocessedAppealRequest,
	type AppealRequest
} from 'wolfstar-database';

/**
 * Why a request of the dashboard could not be done, which it reads from the row as `<code>: <detail>`: a contract with
 * wolfstar.rocks.
 */
export type AppealFailureCode = AppealSettleError | 'blocked' | 'notBlocked' | 'noAccess' | 'failed';

/**
 * How old a request nobody claimed is before a sweep takes it, in milliseconds: a newer one is left to its notification.
 */
const AppealSweepDelay = 5000;

/**
 * How many requests a sweep takes at most.
 */
const SweepLimit = 50;

const FailureDetails: Readonly<Record<AppealFailureCode, string>> = {
	caseGone: 'The case of this appeal is gone.',
	decided: 'This appeal was already decided.',
	undoFailed: 'The case could not be undone, the appeal is still pending.',
	blocked: 'This user is already blocked.',
	notBlocked: 'This user is not blocked.',
	noAccess: 'This member does not review the appeals of this server.',
	failed: 'Something went wrong, it was logged.'
};

/**
 * Does a request.
 *
 * @returns Why it could not be done, `null` when it was.
 */
async function runAppealRequest(request: AppealRequest): Promise<AppealFailureCode | null> {
	const { guildId, moderatorId, reason } = request;
	if (!(await hasAppealAccess(guildId, moderatorId))) return 'noAccess';

	switch (request.kind) {
		case 'Block': {
			const data = { userId: request.userId!, reason, moderatorId, automatic: false };
			return (await createAppealBlock(container.prisma, guildId, data)) ? null : 'blocked';
		}
		case 'Unblock':
			return (await deleteAppealBlock(container.prisma, guildId, request.userId!)) ? null : 'notBlocked';
		case 'Approve':
		case 'Deny': {
			const appeal = await fetchAppeal(container.prisma, guildId, request.appealId!);
			if (appeal === null) return 'caseGone';

			const guild = await container.gatewayClient.guilds.fetch(guildId);
			const result = await settleAppeal(guild, appeal, request.kind === 'Approve', moderatorId, reason);
			if ('error' in result) return result.error;

			await updateAppealMessage(guildId, appeal, result.message);
			return null;
		}
	}
}

/**
 * Handles a request of the dashboard once, whatever brought it (its notification, a sweep, another process), as the
 * requests of the join guard are: leased, read again while it is not done, done, and marked done with why it could not
 * be. A decision taken twice cannot happen: `decideAppeal` only changes a pending appeal.
 *
 * @param requestId - The ID of the request.
 * @returns `Claimed` when another handler has it, or had it done.
 */
export async function handleAppealRequest(requestId: string): Promise<'Claimed' | 'Done' | 'Failed'> {
	const release = await leaseRequest(`wolfstar:appeals:request:${requestId}`, '[Appeals]');
	if (release === null) return 'Claimed';

	try {
		const request = await fetchUnprocessedAppealRequest(container.prisma, requestId);
		if (request === null) return 'Claimed';

		let failure: AppealFailureCode | null;
		try {
			failure = await runAppealRequest(request);
		} catch (error) {
			container.logger.error(`[Appeals] Could not handle the request ${requestId}:`, error);
			failure = 'failed';
		}

		container.logger.debug(`[Appeals] The request ${requestId} of ${request.guildId}: ${request.kind}, ${failure ?? 'done'}`);
		await completeAppealRequest(container.prisma, requestId, failure === null ? null : `${failure}: ${FailureDetails[failure]}`);
		return failure === null ? 'Done' : 'Failed';
	} finally {
		await release();
	}
}

/**
 * Reads the requests a sweep takes: the ones nobody claimed for {@linkcode AppealSweepDelay}, whose notification was lost
 * or came while the bot was not listening.
 */
export function fetchAppealRequestsToSweep(now = Date.now()): Promise<string[]> {
	return fetchPendingAppealRequestIds(container.prisma, now - AppealSweepDelay, SweepLimit);
}
