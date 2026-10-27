import { JoinGuardRequestListener } from '#lib/moderation/joinguard/listener';
import { fetchJoinGuardRequestsToSweep, handleJoinGuardRequest } from '#lib/moderation/joinguard/requests';
import { isWorker } from '#utils/worker';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { Client } from 'pg';

/**
 * Starts hearing the requests of the website to the join guard (`JoinGuardRequest`, see `lib/moderation/joinguard`)
 * once the client is ready, on one process: the gateway, and with the sharder its first shard, as the commands are
 * registered. A worker has no gateway to act with.
 */
@RegisterAsGatewayListener('clientReady', { once: true })
export class UserListener extends EventGatewayListener<'clientReady'> {
	public run() {
		if (isWorker() || (this.container.shard?.id ?? 0) !== 0) return;

		const listener = new JoinGuardRequestListener({
			// A connection of its own: the ones of the pool of Prisma are lent to a query at a time, and a `LISTEN` lasts.
			createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
			handle: (requestId) => handleJoinGuardRequest(requestId),
			sweep: () => fetchJoinGuardRequestsToSweep(),
			logger: this.container.logger
		});
		listener.start();
		for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void listener.stop());
	}
}
