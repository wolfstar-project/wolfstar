import { Events } from '#lib/types';
import { fetchApproximateUserCount } from '#utils/analytics';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { isInfluxInitialized } from '@wolfstar/shared-influx-pieces';

/**
 * Writes the first server and user counts to the analytics once the client is ready, the `poststats` task does it
 * every ten minutes afterwards.
 *
 * @remarks
 *
 * The banner is printed by `main.ts`, and the `poststats` and `syncResourceAnalytics` tasks are repeated by their
 * `pattern`, so they are not scheduled from here anymore.
 */
@RegisterAsGatewayListener('clientReady', { once: true })
export class UserListener extends EventGatewayListener<'clientReady'> {
	public async run() {
		try {
			await this.initAnalytics();
		} catch (error) {
			this.container.logger.fatal(error);
		}
	}

	private async initAnalytics() {
		if (!isInfluxInitialized()) return;

		const { client, gatewayClient } = this.container;
		client.emit(Events.AnalyticsSync, await gatewayClient.guilds.cache.getSize(), await fetchApproximateUserCount());
	}
}
