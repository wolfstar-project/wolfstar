import alias from '@rollup/plugin-alias';
import { defineConfig } from 'vitest/config';
import { aliasEntries } from './scripts/aliases.ts';

export default defineConfig({
	// `enforce: "pre"` runs the alias map before Vite's native package.json "imports"
	// resolution, which would otherwise resolve `#lib/*` to the `dist` build output.
	plugins: [
		{ ...alias({ entries: [...aliasEntries, { find: /^#mocks\/(.*)/, replacement: `${import.meta.dirname}/tests/mocks/$1` }] }), enforce: 'pre' }
	],
	test: {
		environment: 'node',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		include: ['tests/**/*.test.ts']
	},
	oxc: {
		target: 'es2022'
	}
});
