import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

function toPosix(path: string) {
	return path.replace(/\\/g, '/');
}

function fromRoot(...paths: string[]) {
	return toPosix(resolve(...paths));
}

const srcRoot = fromRoot('src');
const libRoot = fromRoot('src', 'lib');
const utilRoot = fromRoot('src', 'lib', 'util');

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^#lib\/(.*)/, replacement: `${libRoot}/$1` },
			{ find: '#lib', replacement: libRoot },
			{ find: /^#root\/(.*)/, replacement: `${srcRoot}/$1.ts` },
			{ find: '#languages', replacement: `${srcRoot}/languages/index.ts` },
			{ find: /^#utils\/(.*)/, replacement: `${utilRoot}/$1` },
			{ find: '#utils', replacement: utilRoot }
		]
	},
	test: {
		setupFiles: ['./tests/vitest.setup.ts'],
		globals: true,
		coverage: {
			reporter: ['text', 'lcov', 'cobertura'],
			reportOnFailure: true,
			include: ['src/lib/**'],
			exclude: [
				'src/lib/api',
				'src/lib/customCommands',
				'src/lib/database/entities',
				'src/lib/database/index.ts',
				'src/lib/database/migrations',
				'src/lib/database/repositories',
				'src/lib/database/settings',
				'src/lib/database/utils',
				'src/lib/discord',
				'src/lib/env',
				'src/lib/extensions',
				'src/lib/games/base',
				'src/lib/games/connect-four',
				'src/lib/games/HungerGamesUsage.ts',
				'src/lib/games/Slotmachine.ts',
				'src/lib/games/tic-tac-toe',
				'src/lib/games/WheelOfFortune.ts',
				'src/lib/i18n/structures/Augments.d.ts',
				'src/lib/moderation',
				'src/lib/setup/PaginatedMessage.ts',
				'src/lib/WolfClient.ts',
				'src/lib/structures',
				'src/lib/types',
				'src/lib/util/APIs',
				'src/lib/util/Color.ts',
				'src/lib/util/decorators.ts',
				'src/lib/util/External',
				'src/lib/util/Leaderboard.ts',
				'src/lib/util/Links',
				'src/lib/util/LongLivingReactionCollector.ts',
				'src/lib/util/Models',
				'src/lib/util/Notifications',
				'src/lib/util/Parsers',
				'src/lib/util/PreciseTimeout.ts',
				'src/lib/util/PromptList.ts',
				'src/lib/util/Security/GuildSecurity.ts',
				'src/lib/util/Security/ModerationActions.ts',
				'src/lib/util/Timers.ts',
				'src/lib/weather'
			]
		}
	},
	esbuild: {
		target: 'es2022'
	}
});
