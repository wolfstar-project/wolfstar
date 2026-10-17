// Must stay the first import: it loads and validates the environment before any module reads it.
import 'varlock/auto-load';
import { createClient, loadAll } from '#lib/Client';
import { initializeApp } from '#lib/setup/all';
import { isShardManager, startShardManager } from '#lib/sharder/manager';
import { isWorker } from '#utils/worker';
import { envParseBoolean, envParseInteger, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import { createBanner } from '@wolfstar/start-banner';
import { vice } from 'gradient-string';

if (isShardManager()) {
	// The shards run this same script, and do what follows instead:
	await startShardManager();
} else {
	initializeApp();
	createClient();
	await loadAll();

	// Every shard would print the same banner:
	if ((container.shard?.id ?? 0) === 0) printBanner();
	console.log('Ready');
}

function printBanner() {
	const status = (enabled: boolean) => (enabled ? '+' : '-');
	// A worker has no HTTP server, so it has no API either:
	const apiEnabled = !isWorker() && envParseBoolean('API_ENABLED', true);

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
					`├─ [${status(!isWorker())}] Gateway   : ${isWorker() ? 'worker, replaying the broker stream' : `${container.gatewayClient.gateway.options.shardCount ?? 'auto'} shards`}`,
					`├─ [${status(envParseBoolean('INFLUX_ENABLED', false))}] Analytics`,
					`├─ [${status(!isWorker())}] HTTP      : ${isWorker() ? 'worker, no interactions endpoint' : `${envParseString('HTTP_ADDRESS', '127.0.0.1')}:${envParseInteger('HTTP_PORT', 3000)}`}`,
					`├─ [${status(apiEnabled)}] API       : ${apiEnabled ? `${envParseString('API_HOST', '127.0.0.1')}:${envParseInteger('API_PORT', 8282)}` : 'off'}`,
					`└─ [+] Redis     : ${container.redis.options.host}:${container.redis.options.port}`
				]
			})
		)
	);
}
