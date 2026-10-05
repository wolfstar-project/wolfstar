import { parseAnalytics } from '#root/config';
import { InfluxDB, type QueryApi, type WriteApi } from '@influxdata/influxdb-client';
import { container } from '@wolfstar/http-framework';
import { envParseString } from '@wolfstar/env-utilities';

export class AnalyticsData {
	public readonly influx: InfluxDB = new InfluxDB(parseAnalytics());
	public readonly writeApi: WriteApi;
	public readonly queryApi: QueryApi;

	public messageCount = 0;

	public constructor() {
		this.writeApi = this.influx.getWriteApi(envParseString('INFLUX_ORG'), envParseString('INFLUX_ORG_ANALYTICS_BUCKET'), 's');
		this.queryApi = this.influx.getQueryApi(envParseString('INFLUX_ORG'));
	}
}

/**
 * Sums the approximate member counts of every guild the bot is in, 200 guilds at a time.
 *
 * @remarks
 *
 * The members are not all cached, and the guilds are in Redis, so the count comes from the API rather than from
 * `guild.memberCount` like on discord.js.
 */
export async function fetchApproximateUserCount() {
	const { api } = container.gatewayClient;

	let total = 0;
	let after: string | undefined;
	while (true) {
		const guilds = await api.users.getGuilds({ limit: 200, with_counts: true, after });
		for (const guild of guilds) total += guild.approximate_member_count ?? 0;

		if (guilds.length < 200) return total;
		after = guilds.at(-1)!.id;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		/**
		 * The InfluxDB clients and counters of the analytics, `null` when `INFLUX_ENABLED` is off.
		 */
		analytics: AnalyticsData | null;
	}
}
