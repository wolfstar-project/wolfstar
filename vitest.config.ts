import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Plugin to resolve Node.js subpath imports (#lib, #utils, etc.)
function resolveSubpathImports() {
	return {
		name: 'resolve-subpath-imports',
		resolveId(id: string) {
			// Handle #lib/* paths
			if (id.startsWith('#lib/')) {
				const path = id.replace('#lib/', 'src/lib/');
				// Try with .ts extension first
				const tsPath = resolve(path + '.ts');
				if (existsSync(tsPath)) return tsPath;
				// Try as directory with index.ts
				const indexPath = resolve(path + '/index.ts');
				if (existsSync(indexPath)) return indexPath;
				// Try without extension (might already have one)
				const directPath = resolve(path);
				if (existsSync(directPath)) return directPath;
			}
			// Handle #utils/* paths
			if (id.startsWith('#utils/')) {
				const path = id.replace('#utils/', 'src/lib/util/');
				const tsPath = resolve(path + '.ts');
				if (existsSync(tsPath)) return tsPath;
				const indexPath = resolve(path + '/index.ts');
				if (existsSync(indexPath)) return indexPath;
				const directPath = resolve(path);
				if (existsSync(directPath)) return directPath;
			}
			// Handle #root/* paths
			if (id.startsWith('#root/')) {
				const path = id.replace('#root/', 'src/');
				const tsPath = resolve(path + '.ts');
				if (existsSync(tsPath)) return tsPath;
			}
			// Handle #languages
			if (id === '#languages') {
				return resolve('src/languages/index.ts');
			}
			return null;
		}
	};
}

export default defineConfig({
	plugins: [resolveSubpathImports()],
	test: {
		environment: 'node',
		pool: 'forks',
		setupFiles: ['./tests/vitest.setup.ts'],
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'cobertura'],
			reportsDirectory: './coverage',
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
