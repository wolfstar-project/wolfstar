import { defineConfig } from 'tsdown';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, copyFileSync, mkdirSync, cpSync } from 'node:fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type { RolldownPluginOption } from 'rolldown';
import alias from '@rollup/plugin-alias';

// Plugin to copy static files from src to dist
function copyPlugin(): RolldownPluginOption {
	return {
		name: 'copy-static-files',
		buildEnd() {
			// Copy worker.mjs to dist (if present)
			const workerFile = resolve(__dirname, 'src/lib/moderation/workers/worker.mjs');
			const destWorkerDir = resolve(__dirname, 'dist/lib/moderation/workers');
			const destWorkerFile = join(destWorkerDir, 'worker.mjs');

			// Copy locales directory to dist
			const srcLocalesDir = resolve(__dirname, 'src/locales');
			const destLocalesDir = resolve(__dirname, 'dist/locales');

			if (existsSync(workerFile)) {
				mkdirSync(destWorkerDir, { recursive: true });
				copyFileSync(workerFile, destWorkerFile);
				console.log('✓ Copied worker.mjs to dist');
			}

			if (existsSync(srcLocalesDir)) {
				mkdirSync(destLocalesDir, { recursive: true });
				cpSync(srcLocalesDir, destLocalesDir, { recursive: true });
				console.log('✓ Copied locales to dist');
			}
		}
	};
}

export default defineConfig({
	entry: ['src/**/*.ts', '!src/locales/**/*.ts'],
	format: 'esm',
	plugins: [
		alias({
			entries: [
				{
					find: '#lib',
					replacement: '#lib',
					customResolver(source) {
						if (source === '#lib/database') return resolve(__dirname, 'src/lib/database/index.ts');
						if (source === '#lib/database/entities') return resolve(__dirname, 'src/lib/database/entities/index.ts');
						if (source === '#lib/database/keys') return resolve(__dirname, 'src/lib/database/keys/index.ts');
						if (source === '#lib/database/settings') return resolve(__dirname, 'src/lib/database/settings/index.ts');
						if (source === '#lib/discord') return resolve(__dirname, 'src/lib/discord/index.ts');
						if (source === '#lib/moderation') return resolve(__dirname, 'src/lib/moderation/index.ts');
						if (source === '#lib/moderation/managers') return resolve(__dirname, 'src/lib/moderation/managers/index.ts');
						if (source === '#lib/moderation/workers') return resolve(__dirname, 'src/lib/moderation/workers/index.ts');
						if (source === '#lib/structures') return resolve(__dirname, 'src/lib/structures/index.ts');
						if (source === '#lib/i18n/languageKeys') return resolve(__dirname, 'src/lib/i18n/languageKeys/index.ts');
						if (source === '#lib/types') return resolve(__dirname, 'src/lib/types/index.ts');
						// Handle other #lib/* imports
						const subPath = source.replace('#lib/', '');
						return resolve(__dirname, 'src/lib', `${subPath}.ts`);
					}
				},
				{ find: /^#root\/(.*)/, replacement: resolve(__dirname, 'src/$1.ts') },
				{
					find: '#utils',
					replacement: '#utils',
					customResolver(source) {
						if (source === '#utils/common') return resolve(__dirname, 'src/lib/util/common/index.ts');
						if (source === '#utils/functions') return resolve(__dirname, 'src/lib/util/functions/index.ts');
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
	deps: { skipNodeModulesBundle: true }
});
