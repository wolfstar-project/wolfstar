import { createLocalWebsiteTarget, createWebsiteListener } from '#lib/database/website';
import { JoinGuardRequestQueue } from '#lib/moderation/joinguard/queue';
import { fetchJoinGuardRequestsToSweep, handleJoinGuardRequest } from '#lib/moderation/joinguard/requests';
import { onShardMessage } from '#lib/sharder/messages';
import { isWorker } from '#utils/worker';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { Client } from 'pg';

/**
 * Starts what hears the website once the client is ready.
 *
 * @remarks
 *
 * - The requests of the join guard (`JoinGuardRequest`) are handled by one process with a gateway: the only one, or
 *   with the sharder its first shard, which the shard manager hands them to (`joinGuardRequest`).
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
		const queue = new JoinGuardRequestQueue({
			handle: (requestId) => handleJoinGuardRequest(requestId),
			sweep: () => fetchJoinGuardRequestsToSweep(),
			logger
		});
		queue.start();

		if (shard !== null) {
			onShardMessage('joinGuardRequest', ({ requestId }) => void queue.enqueue(requestId));
			return;
		}

		const listener = createWebsiteListener(
			createLocalWebsiteTarget((requestId) => queue.enqueue(requestId)),
			{
				createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
				logger
			}
		);
		listener.start();
		for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void listener.stop());
	}
}
