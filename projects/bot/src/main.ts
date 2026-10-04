// Must stay the first import: it loads and validates the environment before any module reads it.
import 'varlock/auto-load';
import { createClient, loadAll } from '#lib/Client';
import { isWorker } from '#utils/worker';
import { envParseBoolean, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import { createBanner } from '@wolfstar/start-banner';
import { vice } from 'gradient-string';

createClient();
await loadAll();

const status = (enabled: boolean) => (enabled ? '+' : '-');

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
				` ├ [${status(!isWorker())}] Gateway   : ${isWorker() ? 'worker, replaying the broker stream' : `${container.gatewayClient.gateway.options.shardCount ?? 'auto'} shards`}`,
				` ├ [${status(envParseBoolean('INFLUX_ENABLED', false))}] Analytics`,
				` ├ [${status(envParseBoolean('API_ENABLED', true))}] API`,
				` └ [+] Redis     : ${container.redis.options.host}:${container.redis.options.port}`
			]
		})
	)
);
console.log('Ready');
