import { createClient, loadAll } from '#lib/Client';
import { initializeApp } from '#lib/setup/all';
import { envParseString } from '@wolfstar/env-utilities';
import { createBanner } from '@wolfstar/start-banner';
import { bold } from 'colorette';
import { vice } from 'gradient-string';
import { container } from 'wolfstar-shared';

initializeApp();

createClient();
await loadAll();

console.log(
	vice.multiline(
		createBanner({
			logo: [
				String.raw`          /          `,
				String.raw`       ${bold('/╬')}▓           `,
				String.raw`     ${bold('/▓▓')}╢            `,
				String.raw`   [${bold('▓▓')}▓╣/            `,
				String.raw`   [╢╢╣▓             `,
				String.raw`    %,╚╣╣@\          `,
				String.raw`      #,╙▓▓▓\╙N      `,
				String.raw`       '╙ \▓▓▓╖╙╦    `,
				String.raw`            \@╣▓╗╢%  `,
				String.raw`               ▓╣╢╢] `,
				String.raw`              /╣▓${bold('▓▓')}] `,
				String.raw`              ╢${bold('▓▓/')}   `,
				String.raw`             ▓${bold('╬/')}     `,
				String.raw`            /        `
			],
			name: [
				String.raw`  ________  __   ___  ___  ___  _______        __ `,
				String.raw` /"       )|/"| /  ")|"  \/"  |/"      \      /""\ `,
				String.raw`(:   \___/ (: |/   /  \   \  /|:        |    /    \ `,
				String.raw` \___  \   |    __/    \\  \/ |_____/   )   /' /\  \ `,
				String.raw`  __/  \\  (// _  \    /   /   //      /   //  __'  \ `,
				String.raw` /" \   :) |: | \  \  /   /   |:  __   \  /   /  \\  \ `,
				String.raw`(_______/  (__|  \__)|___/    |__|  \___)(___/    \___) `
			],
			extra: [
				` Skyra ${envParseString('CLIENT_VERSION')} Gateway`,
				...container.stores.map((store) => `├─ Loaded ${store.size.toString().padEnd(3, ' ')} ${store.name}.`),
				` └ Redis    : ${container.redis.options.host}:${container.redis.options.port}`
			]
		})
	)
);
console.log('Ready');
