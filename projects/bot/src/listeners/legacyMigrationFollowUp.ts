import { followUpLegacyGuild } from '#lib/database/legacyFollowUp';
import { isWorker } from '#utils/worker';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { fetchPendingLegacyFollowUps, markLegacyFollowUp } from 'wolfstar-database';

/**
 * Finishes the guilds the conversion of the legacy tables imported, once the client is ready, by one process: the only
 * one, or with the sharder its first shard. A guild that fails is logged and tried again at the next start.
 */
@RegisterAsGatewayListener('clientReady', { once: true })
export class UserListener extends EventGatewayListener<'clientReady'> {
	public async run() {
		const shard = this.container.shard ?? null;
		if (isWorker() || (shard !== null && shard.id !== 0)) return;

		const { logger, prisma } = this.container;
		const actorId = this.container.gatewayClient.user!.id;
		const guildIds = await fetchPendingLegacyFollowUps(prisma.orm);

		for (const guildId of guildIds) {
			try {
				await followUpLegacyGuild(guildId, actorId);
				await markLegacyFollowUp(prisma.orm, guildId);
			} catch (error) {
				logger.error(`[LEGACY] ${guildId}: what follows the conversion failed`, error);
			}
		}
	}
}
