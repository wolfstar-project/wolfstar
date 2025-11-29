import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';

/**
 * Vite plugin for resolving TypeScript path aliases in tests.
 * Maps `#lib`, `#utils`, `#root`, and `#languages` imports to their source files.
 */
function aliasResolverPlugin(): PluginOption {
	const aliasMap: Record<string, string> = {
		// #lib aliases
		'#lib/database': 'src/lib/database/index.ts',
		'#lib/database/entities': 'src/lib/database/entities/index.ts',
		'#lib/database/keys': 'src/lib/database/keys/index.ts',
		'#lib/database/settings': 'src/lib/database/settings/index.ts',
		'#lib/discord': 'src/lib/discord/index.ts',
		'#lib/i18n': 'src/lib/i18n/index.ts',
		'#lib/i18n/languageKeys': 'src/lib/i18n/languageKeys/index.ts',
		'#lib/moderation': 'src/lib/moderation/index.ts',
		'#lib/moderation/managers': 'src/lib/moderation/managers/index.ts',
		'#lib/moderation/workers': 'src/lib/moderation/workers/index.ts',
		'#lib/schedule': 'src/lib/schedule/index.ts',
		'#lib/structures': 'src/lib/structures/index.ts',
		'#lib/structures/managers': 'src/lib/structures/managers/index.ts',
		'#lib/setup': 'src/lib/setup/index.ts',
		'#lib/types': 'src/lib/types/index.ts',

		// #utils aliases
		'#utils/common': 'src/lib/util/common/index.ts',
		'#utils/functions': 'src/lib/util/functions/index.ts',

		// #languages alias
		'#languages': 'src/languages/index.ts'
	};

	function resolveCandidate(basePath: string): string | null {
		// if the path already exists as-is
		if (existsSync(basePath)) return basePath;
		// try file with .ts extension
		const tsPath = `${basePath}.ts`;
		if (existsSync(tsPath)) return tsPath;
		// try directory index.ts
		const indexTs = join(basePath, 'index.ts');
		if (existsSync(indexTs)) return indexTs;
		return null;
	}

	return {
		name: 'alias-resolver',
		enforce: 'pre',
		resolveId(source) {
			// Exact match in alias map
			if (source in aliasMap) {
				return resolve(aliasMap[source]);
			}

			// #lib/* fallback pattern
			if (source.startsWith('#lib/')) {
				const base = resolve(source.replace('#lib', 'src/lib'));
				const target = resolveCandidate(base);
				return target ? target : null;
			}

			// #utils/* fallback pattern
			if (source.startsWith('#utils/')) {
				const base = resolve(source.replace('#utils', 'src/lib/util'));
				const target = resolveCandidate(base);
				return target ? target : null;
			}

			// #root/* pattern
			if (source.startsWith('#root/')) {
				const base = resolve(source.replace('#root/', 'src/'));
				const target = resolveCandidate(base);
				return target ? target : null;
			}

			return null;
		}
	};
}

export default defineConfig({
	plugins: [aliasResolverPlugin()],
	test: {
		setupFiles: ['./tests/vitest.setup.ts'],
		globals: true,
		coverage: {
			reporter: ['text', 'lcov', 'cobertura'],
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
