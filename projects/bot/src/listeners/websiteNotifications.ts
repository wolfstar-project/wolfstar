import { createLocalWebsiteTarget, createWebsiteClient, createWebsiteListener } from '#lib/database/website';
import { fetchAppealRequestsToSweep, handleAppealRequest } from '#lib/moderation/appealRequests';
import { fetchJoinGuardRequestsToSweep, handleJoinGuardRequest } from '#lib/moderation/joinguard/requests';
import { fetchOnboardingRequestsToSweep, handleOnboardingRequest } from '#lib/onboarding/requests';
import { onShardMessage } from '#lib/sharder/messages';
import { RequestQueue } from '#utils/requestQueue';
import { isWorker } from '#utils/worker';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';

/**
 * Starts what hears the website once the client is ready.
 *
 * @remarks
 *
 * - The requests of the join guard, the appeals and the onboarding (`JoinGuardRequest`, `AppealRequest`,
 *   `OnboardingRequest`) are handled by one process
 *   with a gateway: the only one, or with the sharder its first shard, which the shard manager hands them to.
 * - The connection that listens to the database (`createWebsiteListener`) is here only when the bot runs in one
 *   process: with the sharder it is in the shard manager, which tells every shard (`lib/sharder/manager.ts`).
 * - A worker has no gateway to act with, and does neither.
 */
@RegisterAsGatewayListener('clientReady', { once: true })
export class UserListener extends EventGatewayListener<'clientReady'> {
	public run() {
		const shard = this.container.shard ?? null;
		if (isWorker() || (shard !== null && shard.id !== 0)) return;

		const { logger } = this.container;
		const queue = new RequestQueue({
			header: '[JoinGuard]',
			handle: (requestId) => handleJoinGuardRequest(requestId),
			sweep: () => fetchJoinGuardRequestsToSweep(),
			logger
		});
		const appeals = new RequestQueue({
			header: '[Appeals]',
			handle: (requestId) => handleAppealRequest(requestId),
			sweep: () => fetchAppealRequestsToSweep(),
			logger
		});
		const onboarding = new RequestQueue({
			header: '[Onboarding]',
			handle: (requestId) => handleOnboardingRequest(requestId),
			sweep: () => fetchOnboardingRequestsToSweep(),
			logger
		});
		queue.start();
		appeals.start();
		onboarding.start();

		if (shard !== null) {
			onShardMessage('joinGuardRequest', ({ requestId }) => void queue.enqueue(requestId));
			onShardMessage('appealRequest', ({ requestId }) => void appeals.enqueue(requestId));
			onShardMessage('onboardingRequest', ({ requestId }) => void onboarding.enqueue(requestId));
			return;
		}

		const listener = createWebsiteListener(
			createLocalWebsiteTarget(
				(requestId) => queue.enqueue(requestId),
				(requestId) => appeals.enqueue(requestId),
				(requestId) => onboarding.enqueue(requestId)
			),
			{
				createClient: createWebsiteClient,
				logger
			}
		);
		listener.start();
		for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void listener.stop());
	}
}
