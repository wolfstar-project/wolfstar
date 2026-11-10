// Must stay the first import: it loads and validates the environment before any module reads it.
import 'varlock/auto-load';
import { createClient, loadAll } from '#lib/Client';
import { initializeApp } from '#lib/setup/all';
import { isShardManager, startShardManager } from '#lib/sharder/manager';
import { closeLoggerOnShutdown } from '#utils/shutdown';
import { formatStartupStatus, type StartupStatus } from '#utils/startup';
import { forwardsDispatches, isWorker } from '#utils/worker';
import { envParseBoolean, envParseInteger, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import { isInfluxInitialized } from '@wolfstar/shared-influx-pieces';
import { createBanner } from '@wolfstar/start-banner';
import { vice } from 'gradient-string';

if (isShardManager()) {
	// The shards run this same script, and do what follows instead:
	await startShardManager();
} else {
	initializeApp();
	createClient();
	// A worker stops through the signals of its broker consumer (`shutdownSignals`), which have it finish what it is doing:
	if (!isWorker()) closeLoggerOnShutdown();
	await loadAll();

	// Every shard would print the same banner:
	if ((container.shard?.id ?? 0) === 0) printBanner();
	console.log('Ready');
}

function printBanner() {
	console.log(
		vice.multiline(
			createBanner({
				logo: [
					String.raw`                                                                 .`,
					String.raw`                       @@@@@@@                 @@@@ @@@@@`,
					String.raw`                       @@@@@@@@@@             @@@@@@@@@@@@`,
					String.raw`                       @@   @@@@@@@@         @@@@ @@@@@@@@@@`,
					String.raw`                       @@      @@@@@@@@     @@@@  @@@@@@@@@@@`,
					String.raw`                       @@@        @@@@@    @@@@  @@@ @@@@ @@@@@`,
					String.raw`                       @@@      @@@@@ @@@ @@@@ . @@@  @@@@ @@@@@`,
					String.raw`                        @@   @@@@@ @@@@@@@@@@    @@    @@@@  @@@@`,
					String.raw`                        @@@@@@@ @@@@ @@@ @@@    @@@     @@@  .@@@`,
					String.raw`                        @@@@ @@@@@@@@@@ @@@@@@@@@@@  @@@@@@@   @@ @@@`,
					String.raw`                    .   @@@@@@@ @@@@@@@@@@      @@@  @@@@ @@@  @@ @@@@@`,
					String.raw`                      @@@@@@    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ @@@@@@`,
					String.raw`                     @@@@@      @@@@            @@@     @@@@@@@@@ @@ @@@@`,
					String.raw`                    @@@@               .        @@  @@@@ @@ @@@@ @@@  @@@@@`,
					String.raw`                   @@@@                         @@@@@@@@ @@@@@@@ @@@   @@@@@@.`,
					String.raw`                   @@@                              @@@@@@@@@@@@@@@      @@@@@`,
					String.raw`                  @@@                   @@@               @@@@@@@@@@@@@@@@@ @@@`,
					String.raw`                  @@@       @@@@@@ @@@@@@@@@@@@@@@@@@        @@@@@@@@@@@@@@@@@@`,
					String.raw`                @@@@       @@@@ @@@@@@  @@ @@      @@@@@@      @@@@@  @@@@@@ @@`,
					String.raw`              @@@@@@      @@@@@ @@@@@@@@@@ @@@@@@@@@@@@@@@@@     @@@@ @@@@@@@@@@@@`,
					String.raw`          @@@@@@@@       @@@@@@  @@@@@              @@ @@@@@@@@   @@@@@@@@@@@@@@@@@@`,
					String.raw`       @@@@@@@@@         @@@@@@  @@                 @@@@@@@@@@@@   @@@@@@ @@@@@ @@@@`,
					String.raw`    @@@@@@@@             @@@@@@  @@@@@@@@           @@@@@@@@@@@@@@  @@@@@@@@@@@@@ @@`,
					String.raw` @@@@@@@@                  @@@@@@@@@  @@@@@@@@       @@@@@@@@@@@@@@ @@@@@@@@@ @@@@@@`,
					String.raw` @@@@@@@@                         @@@@@@@ @@@@@@@   @@@ @@ @@@@ @@@@@@@@@  @@@@@@@@@`,
					String.raw` @@@@@@@@                     @@@     @@@@@@@@@@@@@ @@@ @@  @@@  @@@@@@@@   @@@  @@@`,
					String.raw` @@@@@@@@                @@@@@@ @      @@@@@@@@@@@@@@@@ @@@   @@   @@@@ @@@   @@@   @`,
					String.raw`     @@@             @@@@@@@@@@@@      @@@@ @@@@@@@@@@@@@@   @@   @@@@ @@@   @@@`,
					String.raw`     @@@@@@      @@@@@@@@@@@@@@@@@@@   @@@@@@@@@@@@ @@@@@   @@@   @@ @@ @@@   @@`,
					String.raw`     @@@@@@@@@@@@@@@ @@@@@@@      @@@@@@@@@ @@@@@@ @@@@@   @@@@   @@@@@ @@@@  @@`,
					String.raw`        @@@@     @@@@@@           @@@@@@@@@@@@ .@@@@@@   @@@@@   @@@@@@  @@@@ @@`,
					String.raw`        @@@@      @@@@@@@@@@@@@ @@@@@@@@@@@    @@@@@   @@@@@@@ @@@@ @@@   @@@@@@`,
					String.raw`          @@@@@@@@@@@@@     @@@@@@@@@@@@@      @@   @@@@@ @@@@@@@@@@@@ @@@ @@@@@`,
					String.raw`                           @@@ @@@@@@@           @@@@@@ @@@@@@@@@@@@ @@@@@  @@@`,
					String.raw`           .         .    @@@ @@@@@@         @@@@@@@@@@@@ @@@ @@@ @@@@@@@@`,
					String.raw`                         .@@ @@ @@@       @@@@@@@@@@@@@ @@@@ @@@@@@@@ @@@@`,
					String.raw`                          @@@@ @@@     @@@@@@@ @@@ @@ @@@@@@@@@@@@ @@@@@@`,
					String.raw`                          @@@ @@@    @@@@@@ @@@@@@@@@@@@@@@@@@@ @@@@@@@`,
					String.raw`                          @@@@@@   @@@@@@@@@@@@@@@@@@@@@@@ @@@@@@@@@`,
					String.raw`                          @@ @@  @@@@@@ @@@@@ @@@ @@@@@@ @@@@@@@@@`,
					String.raw`                            @@@ @@@@@  @@@@   @@@ @@@ @@@@@@@@`,
					String.raw`                            @@ @@@@   @@@@    @@  @@@@@@@@`,
					String.raw`                            @@@@@@   @@@@     @@  @@@@                      .  .`,
					String.raw`                 .          @@@@@    @@@      @@`,
					String.raw`                            @@@@     @@    @@@@@`
				],
				name: [
					String.raw`       __          __   _  __ _____ _`,
					String.raw`       \ \        / /  | |/ _/ ____| |`,
					String.raw`        \ \  /\  / /__ | | || (___ | |_ __ _ _ __`,
					String.raw`         \ \/  \/ / _ \| |  _\___ \| __/ _\` | '__|`,
					String.raw`          \  /\  / (_) | | | ____) | || (_| | |`,
					String.raw`           \/  \/ \___/|_|_||_____/ \__\__,_|_|`
				],
				extra: [
					` WolfStar ${envParseString('CLIENT_VERSION')}`,
					...container.stores.map((store) => `├─ Loaded ${store.size.toString().padEnd(3, ' ')} ${store.name}.`),
					`├─ Loaded ${container.i18n.languages.size.toString().padEnd(3, ' ')} languages.`,
					...formatStartupStatus(readStartupStatus())
				]
			})
		)
	);
}

function readStartupStatus(): StartupStatus {
	const redis = { host: container.redis.options.host ?? 'localhost', port: container.redis.options.port ?? 6379 };
	const stream = envParseString('BROKER_STREAM', 'wolfstar:events');
	if (isWorker()) {
		return {
			analytics: isInfluxInitialized(),
			redis,
			role: {
				mode: 'worker',
				broker: { stream, group: envParseString('BROKER_GROUP', 'workers'), consumer: envParseString('BROKER_CONSUMER', 'worker-1') }
			}
		};
	}

	return {
		analytics: isInfluxInitialized(),
		redis,
		role: {
			mode: 'gateway',
			shards: container.gatewayClient.gateway.options.shardCount ?? 'auto',
			http: { address: envParseString('HTTP_ADDRESS', '127.0.0.1'), port: envParseInteger('HTTP_PORT', 3000) },
			api: envParseBoolean('API_ENABLED', true)
				? { host: envParseString('API_HOST', '127.0.0.1'), port: envParseInteger('API_PORT', 8282) }
				: null,
			brokerStream: forwardsDispatches() ? stream : null
		}
	};
}
