import { defineConfig } from 'tsdown';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, copyFileSync, mkdirSync, cpSync } from 'node:fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type { RolldownPluginOption } from 'rolldown';
import alias from '@rollup/plugin-alias';

// Plugin to copy .mjs files from src to dist
function copyPlugin(): RolldownPluginOption {
	return {
		name: 'copy-mjs-files',
		buildEnd() {
			// Copy worker.mjs to dist
			const workerFile = resolve(__dirname, 'src/lib/moderation/workers/worker.mjs');
			const destDir = resolve(__dirname, 'dist/lib/moderation/workers');
			const destFile = join(destDir, 'worker.mjs');

			const srcDir = resolve(__dirname, 'src/languages');
			const destLanguagesDir = resolve(__dirname, 'dist/languages');

			if (existsSync(workerFile)) {
				mkdirSync(destDir, { recursive: true });
				copyFileSync(workerFile, destFile);
				console.log('✓ Copied worker.mjs to dist');
			}

			if (existsSync(srcDir)) {
				mkdirSync(destLanguagesDir, { recursive: true });
				cpSync(srcDir, destLanguagesDir, { recursive: true });
				console.log('✓ Copied languages to dist');
			}
		}
	};
}

export default defineConfig({
	entry: ['src/**/*.ts', '!src/languages/**/*.ts'],
	format: 'esm',
	plugins: [
		alias({
			entries: [
				{
					find: '#lib',
					replacement: '#lib',
					customResolver(source) {
						if (source === '#lib/database') return resolve('src/lib/database/index.ts');
						if (source === '#lib/database/entities') return resolve('src/lib/database/entities/index.ts');
						if (source === '#lib/database/keys') return resolve('src/lib/database/keys/index.ts');
						if (source === '#lib/database/settings') return resolve('src/lib/database/settings/index.ts');
						if (source === '#lib/discord') return resolve('src/lib/discord/index.ts');
						if (source === '#lib/moderation') return resolve('src/lib/moderation/index.ts');
						if (source === '#lib/moderation/actions') return resolve('src/lib/moderation/actions/index.ts');
						if (source === '#lib/moderation/common') return resolve('src/lib/moderation/common/index.ts');
						if (source === '#lib/moderation/managers/loggers') return resolve('src/lib/moderation/managers/loggers/index.ts');
						if (source === '#lib/moderation/managers') return resolve('src/lib/moderation/managers/index.ts');
						if (source === '#lib/moderation/workers') return resolve('src/lib/moderation/workers/index.ts');
						if (source === '#lib/schedule') return resolve('src/lib/schedule/index.ts');
						if (source === '#lib/structures') return resolve('src/lib/structures/index.ts');
						if (source === '#lib/structures/data') return resolve('src/lib/structures/data/index.ts');
						if (source === '#lib/structures/managers') return resolve('src/lib/structures/managers/index.ts');
						if (source === '#lib/setup') return resolve('src/lib/setup/index.ts');
						if (source === '#lib/types') return resolve('src/lib/types/index.ts');
						if (source === '#lib/i18n/languageKeys') return resolve('src/lib/i18n/languageKeys/index.ts');
						if (source === '#lib/i18n') return resolve('src/lib/i18n/index.ts');
						// Handle other #lib/* imports
						const subPath = source.replace('#lib/', '');
						return resolve(__dirname, 'src/lib', `${subPath}.ts`);
					}
				},
				{ find: /^#root\/(.*)/, replacement: resolve('src/$1.ts') },
				{ find: '#languages', replacement: resolve('src/languages/index.ts') },
				{
					find: '#utils',
					replacement: '#utils',
					customResolver(source) {
						if (source === '#utils/common') return resolve('src/lib/util/common/index.ts');
						if (source === '#utils/functions') return resolve('src/lib/util/functions/index.ts');
						if (source === '#utils/resolvers') return resolve('src/lib/util/resolvers/index.ts');
						// Handle other #utils/* imports
						const subPath = source.replace('#utils/', '');
						return resolve(__dirname, 'src/lib/util', `${subPath}.ts`);
					}
				}
			]
		}),
		copyPlugin()
	],
	dts: true,
	unbundle: true,
	sourcemap: true,
	minify: false,
	platform: 'node',
	tsconfig: 'src/tsconfig.json',
	treeshake: true,
	skipNodeModulesBundle: true
});
