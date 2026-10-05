import { Events } from '#lib/types';
import { envParseBoolean } from '@wolfstar/env-utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';

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
		if (!envParseBoolean('INFLUX_ENABLED', false)) return;

		const { client, gatewayClient } = this.container;
		client.emit(Events.AnalyticsSync, await gatewayClient.guilds.cache.getSize(), await this.fetchMemberCount());
	}

	/**
	 * Sums the approximate member counts of every guild the bot is in, 200 guilds at a time: the members are not all
	 * cached, see the `poststats` task.
	 */
	private async fetchMemberCount() {
		const { api } = this.container.gatewayClient;

		let total = 0;
		let after: string | undefined;
		while (true) {
			const guilds = await api.users.getGuilds({ limit: 200, with_counts: true, after });
			for (const guild of guilds) total += guild.approximate_member_count ?? 0;

			if (guilds.length < 200) return total;
			after = guilds.at(-1)!.id;
		}
	}
}
