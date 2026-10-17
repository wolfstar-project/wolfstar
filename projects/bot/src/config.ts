import type { ConnectionOptions } from '@influxdata/influxdb-client';
import { envIsDefined, envParseString } from '@wolfstar/env-utilities';

/**
 * The IDs of the bot's owners, read from `CLIENT_OWNERS` (separated by spaces).
 */
export const OWNERS: readonly string[] = envParseString('CLIENT_OWNERS', '').split(' ').filter(Boolean);

export function parseAnalytics(): ConnectionOptions {
	const url = envParseString('INFLUX_URL');
	const token = envParseString('INFLUX_TOKEN');

	if (envIsDefined('INFLUX_PROXY_URL')) {
		const proxyUrl = envParseString('INFLUX_PROXY_URL');
		return { proxyUrl, url, token };
	}

	return { url, token };
}
