import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const configDir = dirname(fileURLToPath(import.meta.url));

function toPosix(path: string) {
	return path.replace(/\\/g, '/');
}

function fromRoot(...paths: string[]) {
	return toPosix(resolve(configDir, ...paths));
}

const srcRoot = fromRoot('projects', 'bot', 'src');
const libRoot = fromRoot('projects', 'bot', 'src', 'lib');
const utilRoot = fromRoot('projects', 'bot', 'src', 'lib', 'utilities');
const commonRoot = fromRoot('projects', 'bot', 'src', 'lib', 'common');
const typesRoot = fromRoot('projects', 'bot', 'src', 'lib', 'types');
const testsRoot = fromRoot('projects', 'bot', 'tests');

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^#mocks\/(.*)/, replacement: `${testsRoot}/mocks/$1` },
			{ find: /^#lib\/(.*)/, replacement: `${libRoot}/$1` },
			{ find: '#lib', replacement: libRoot },
			{ find: /^#utils\/(.*)/, replacement: `${utilRoot}/$1` },
			{ find: '#utils', replacement: utilRoot },
			{ find: /^#common\/(.*)/, replacement: `${commonRoot}/$1` },
			{ find: '#common', replacement: commonRoot },
			{ find: /^#types\/(.*)/, replacement: `${typesRoot}/$1` },
			{ find: '#types', replacement: typesRoot },
			{ find: /^#root\/(.*)/, replacement: `${srcRoot}/$1.ts` },
			{ find: '#root/config', replacement: `${srcRoot}/config.ts` }
		]
	},
	test: {
		include: [
			fromRoot('projects/bot/tests/**/*.test.ts'),
			fromRoot('projects/shared/tests/**/*.test.ts'),
			// The locale structural gate lives here. vitest 5 no longer discovers a
			// config in parent directories, so it has to be in the root include set
			// for `vitest run tests/languages` to match anything.
			fromRoot('tests/**/*.test.ts')
		],
		setupFiles: [fromRoot('projects/bot/tests/setup.ts')],
		globals: true,
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
			reportsDirectory: fromRoot('coverage'),
			reporter: ['text', 'lcov', 'cobertura'],
			reportOnFailure: true,
			include: ['projects/bot/src/lib/**']
		}
	},
	oxc: {
		target: 'es2022'
	}
});
