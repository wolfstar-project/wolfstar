import type { KnipConfig } from 'knip';

export default {
	// The exports of `src/lib` are auto-imported by the Stars CLI, which knip cannot see: an export it reports as unused
	// may be used without an import. They are reported, but do not fail the run.
	rules: {
		exports: 'warn',
		types: 'warn',
		enumMembers: 'warn'
	},
	workspaces: {
		'.': {
			entry: ['scripts/**/*.{ts,mjs}', 'golar.config.ts', 'taze.config.ts'],
			project: ['scripts/**/*.{ts,mjs}', '*.config.ts'],
			ignoreDependencies: [
				// Extended by `tsconfig.base.json`:
				'@sapphire/ts-config',
				// The path of the commitizen adapter, in `package.json#config`:
				'cz-conventional-changelog',
				// The build tool the Stars CLI of the bot runs:
				'tsdown'
			]
		},
		'projects/bot': {
			// The pieces are loaded from their directories by the framework, and the worker by its path: nothing imports them.
			entry: [
				'src/main.ts',
				'src/{commands,interaction-handlers,listeners,preconditions,routes,scheduled-tasks,serializers}/**/*.ts',
				'src/lib/moderation/workers/worker.mts',
				'scripts/*.{ts,mjs}',
				'stars.config.ts',
				'tests/**/*.ts'
			],
			project: ['src/**/*.{ts,mts}', 'scripts/**/*.{ts,mjs}', 'tests/**/*.ts'],
			// Kept although nothing imports them yet: the barrels of `src/lib`, and the timer helpers ported from the original bot.
			// `env.d.ts` is written by Varlock and only declares globals, so nothing imports it either.
			ignore: ['src/lib/**/index.ts', 'src/lib/utilities/Timers.ts', 'src/@types/env.d.ts'],
			// The Stars CLI injects `import '@wolfstar/plugin-*/register'` into `main.ts` for every plugin in `dependencies`:
			ignoreDependencies: ['@wolfstar/plugin-.+']
		},
		'projects/database': {
			project: ['src/**/*.ts']
		}
	}
} satisfies KnipConfig;
