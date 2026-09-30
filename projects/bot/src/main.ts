import { createClient, loadAll } from '#lib/Client';
import { initializeApp } from '#lib/setup/all';
import { envParseBoolean, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import { blue, gray, green, red, redBright, white, yellow } from 'colorette';

initializeApp();

createClient();
await loadAll();

printBanner();
printStoreDebugInformation();

function printBanner() {
	const dev = process.env.NODE_ENV === 'development';
	const success = green('+');
	const failed = red('-');
	const llc = dev ? redBright : white;
	const blc = dev ? red : gray;

	const line01 = llc(String.raw`                                                                 .                   `);
	const line02 = llc(String.raw`                       ${blc('@@@@@@@')}                 @@@@ @@@@@                            `);
	const line03 = llc(String.raw`                       ${blc('@@@@@@@@@@')}             @@@@@@@@@@@@                           `);
	const line04 = llc(String.raw`                       @@   ${blc('@@@@@@@@')}         @@@@ @@@@@@@@@@                         `);
	const line05 = llc(String.raw`                       @@      ${blc('@@@@@@@@')}     @@@@  @@@@@@@@@@@                        `);
	const line06 = llc(String.raw`                       @@@        ${blc('@@@@@')}    @@@@  @@@ @@@@ @@@@@                      `);
	const line07 = llc(String.raw`                       @@@      ${blc('@@@@@ @@@')} @@@@ . @@@  @@@@ @@@@@                     `);
	const line08 = llc(String.raw`                        @@   ${blc('@@@@@ @@@@@@@@@@')}    @@    @@@@  @@@@                    `);
	const line09 = llc(String.raw`                        @@@@@@@ ${blc('@@@@ @@@ @@@')}    @@@     @@@  .@@@                    `);
	const line10 = llc(String.raw`                        @@@@ ${blc('@@@@@@@@@@ @@@@@@@@@@@')}  @@@@@@@   @@ @@@                `);
	const line11 = llc(String.raw`                    .   @@@@@@@ ${blc('@@@@@@@@@@      @@@')}  @@@@ @@@  @@ @@@@@              `);
	const line12 = llc(String.raw`                      @@@@@@    ${blc('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')} @@@@@@             `);
	const line13 = llc(String.raw`                     @@@@@      ${blc('@@@@            @@@     @@@@@@@@@ @@ @@@@')}            `);
	const line14 = llc(String.raw`                    @@@@               .        @@  @@@@ @@ @@@@ @@@  @@@@@                  `);
	const line15 = llc(String.raw`                   @@@@                         @@@@@@@@ @@@@@@@ @@@   @@@@@@.               `);
	const line16 = llc(String.raw`                   @@@                              @@@@@@@@@@@@@@@      @@@@@               `);
	const line17 = llc(String.raw`                  @@@                   @@@               @@@@@@@@@@@@@@@@@ @@@              `);
	const line18 = llc(String.raw`                  @@@       @@@@@@ ${blc('@@@@@@@@@@@@@@@@@@')}        @@@@@@@@@@@@@@@@@@      `);
	const line19 = llc(String.raw`                @@@@       @@@@ ${blc('@@@@@@  @@ @@      @@@@@@')}      @@@@@  @@@@@@ @@      `);
	const line20 = llc(String.raw`              @@@@@@      @@@@@ ${blc('@@@@@@@@@@ @@@@@@@@@@@@@@@@@')}     @@@@ @@@@@@@@@@@@   `);
	const line21 = llc(String.raw`          @@@@@@@@       @@@@@@  ${blc('@@@@@              @@ @@@@@@@@')}   @@@@@@@@@@@@@@@@@@ `);
	const line22 = llc(String.raw`       @@@@@@@@@         @@@@@@  @@                 ${blc('@@@@@@@@@@@@')}   @@@@@@ @@@@@ @@@@ `);
	const line23 = llc(String.raw`    @@@@@@@@             @@@@@@  @@@@@@@@           ${blc('@@@@@@@@@@@@@@')}  @@@@@@@@@@@@@ @@ `);
	const line24 = llc(String.raw` @@@@@@@@                  @@@@@@@@@  @@@@@@@@       ${blc('@@@@@@@@@@@@@@')} @@@@@@@@@ @@@@@@ `);
	const line25 = llc(String.raw` @@@@@@@@                         @@@@@@@ @@@@@@@   @@@ @@ @@@@ ${blc('@@@@@@@@@  @@@@@@@@@')} `);
	const line26 = llc(String.raw` @@@@@@@@                     @@@     @@@@@@@@@@@@@ @@@ @@  @@@  ${blc('@@@@@@@@   @@@  @@@')} `);
	const line27 = llc(String.raw` @@@@@@@@                @@@@@@ @      ${blc('@@@@@@@@@@@@@@@@ @@@   @@   @@@@ @@@   @@@   @')} `);
	const line28 = llc(String.raw`     @@@             @@@@@@@@@@@@      ${blc('@@@@ @@@@@@@@@@@@@@   @@   @@@@ @@@   @@@     ')}`);
	const line29 = llc(String.raw`     @@@@@@      @@@@@@@@@@@@@@@@@@@   ${blc('@@@@@@@@@@@@ @@@@@')}   @@@   @@ @@ @@@   @@     `);
	const line30 = llc(String.raw`     @@@@@@@@@@@@@@@ @@@@@@@      @@@@@@@@@ @@@@@@ @@@@@   @@@@   @@@@@ @@@@  @@     `);
	const line31 = llc(String.raw`        @@@@     @@@@@@           @@@@@@@@@@@@ .@@@@@@   @@@@@   @@@@@@  @@@@ @@     `);
	const line32 = llc(String.raw`        @@@@      @@@@@@@@@@@@@ ${blc('@@@@@@@@@@@    @@@@@   @@@@@@@ @@@@ @@@   @@@@@@     ')}`);
	const line33 = llc(String.raw`          @@@@@@@@@@@@@     ${blc('@@@@@@@@@@@@@      @@')}   @@@@@ @@@@@@@@@@@@ @@@ @@@@@     `);
	const line34 = llc(String.raw`                           ${blc('@@@ @@@@@@@           @@@@@@ @@@@@@@@@@@@ @@@@@  @@@')}      `);
	const line35 = llc(String.raw`           .         .    ${blc('@@@ @@@@@@         @@@@@@@@@@@@ @@@ @@@ @@@@@@@@')}           `);
	const line36 = llc(String.raw`                         .${blc('@@ @@ @@@       @@@@@@@@@@@@@ @@@@ @@@@@@@@ @@@@')}           `);
	const line37 = llc(String.raw`                          @@@@ ${blc('@@@     @@@@@@@ @@@ @@ @@@@@@@@@@@@ @@@@@@')}            `);
	const line38 = llc(String.raw`                          @@@ ${blc('@@@    @@@@@@ @@@@@@@@@@@@@@@@@@@ @@@@@@@')}              `);
	const line39 = llc(String.raw`                          @@@@@@   ${blc('@@@@@@@@@@@@@@@@@@@@@@@ @@@@@@@@@')}                `);
	const line40 = llc(String.raw`                          @@ @@  ${blc('@@@@@@ @@@@@ @@@ @@@@@@ @@@@@@@@@')}                   `);
	const line41 = llc(String.raw`                            @@@ ${blc('@@@@@  @@@@   @@@ @@@ @@@@@@@@')}                       `);
	const line42 = llc(String.raw`                            @@ @@@@   @@@@    @@  @@@@@@@@                           `);
	const line43 = llc(String.raw`                            @@@@@@   @@@@     @@  @@@@                      .  .     `);
	const line44 = llc(String.raw`                 .          @@@@@    @@@      @@                                      `);
	const line45 = llc(String.raw`                            @@@@     @@    @@@@@                                      `);
	// Offset Pad
	const pad = ' '.repeat(7);

	console.log(
		String.raw`
${line01}
${line02}
${line03}
${line04}
${line05}
${line06}
${line07}
${line08}
${line09}
${line10}
${line11}
${line12}
${line13}
${line14}
${line15}
${line16}
${line17}
${line18}
${line19}
${line20}
${line21}
${line22}
${line23}
${line24}
${line25}
${line26}
${line27}
${line28}
${line29}
${line30}
${line31}
${line32}
${line33}
${line34}
${line35}
${line36}
${line37}
${line38}
${line39}
${line40}
${line41}
${line42}
${line43}
${line44}
${line45}
       __          __   _  __ _____ _
${pad} \ \        / /  | |/ _/ ____| |
${pad}  \ \  /\  / /__ | | || (___ | |_ __ _ _ __
${pad}   \ \/  \/ / _ \| |  _\___ \| __/ _\` | '__|
${pad}    \  /\  / (_) | | | ____) | || (_| | |
${pad}     \/  \/ \___/|_|_||_____/ \__\__,_|_|
${blc(envParseString('CLIENT_VERSION').padStart(55, ' '))}
${pad}[${success}] Gateway
${pad}[${envParseBoolean('INFLUX_ENABLED', false) ? success : failed}] Analytics
${pad}[${envParseBoolean('API_ENABLED', true) ? success : failed}] API
${pad}[${success}] Moderation
${dev ? ` ${pad}${blc('<')}${llc('/')}${blc('>')} ${llc('DEVELOPMENT MODE')}` : ''}
		`.trim()
	);
}

function printStoreDebugInformation() {
	const { logger, i18n } = container;
	const style = process.env.NODE_ENV === 'development' ? yellow : blue;

	for (const store of container.stores.values()) {
		logger.info(gray(`├─ Loaded ${style(store.size.toString().padEnd(2, ' '))} ${store.name}.`));
	}

	logger.info(gray(`└─ Loaded ${style(i18n.languages.size.toString().padEnd(2, ' '))} languages.`));
}
