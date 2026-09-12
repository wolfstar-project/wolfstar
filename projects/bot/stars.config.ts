import alias from '@rollup/plugin-alias';
import { defineConfig } from '@wolfstar/http-framework/config';
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function copyStaticFiles() {
	return {
		name: 'copy-static-files',
		buildEnd() {
			const workerFile = resolve(import.meta.dirname, 'src/lib/moderation/workers/worker.mjs');
			const workerDirectory = resolve(import.meta.dirname, 'dist/lib/moderation/workers');
			const localesDirectory = resolve(import.meta.dirname, 'src/locales');
			const outputLocalesDirectory = resolve(import.meta.dirname, 'dist/locales');

			if (existsSync(workerFile)) {
				mkdirSync(workerDirectory, { recursive: true });
				copyFileSync(workerFile, resolve(workerDirectory, 'worker.mjs'));
			}

			if (existsSync(localesDirectory)) {
				mkdirSync(outputLocalesDirectory, { recursive: true });
				cpSync(localesDirectory, outputLocalesDirectory, { recursive: true });
			}
		}
	};
}

export default defineConfig({
	entry: 'src/main.ts',
	future: { compatibilityVersion: 4 },
	imports: {
		// Legacy modules still export many duplicate names; keep the framework presets
		// enabled without scanning the application itself until that migration is complete.
		dirs: []
	},
	tsdown: {
		plugins: [
			alias({
				entries: [
					{
						find: '#lib',
						replacement: '#lib',
						customResolver(source) {
							const aliases = new Map([
								['#lib/database', 'src/lib/database/index.ts'],
								['#lib/database/entities', 'src/lib/database/entities/index.ts'],
								['#lib/database/keys', 'src/lib/database/keys/index.ts'],
								['#lib/database/settings', 'src/lib/database/settings/index.ts'],
								['#lib/discord', 'src/lib/discord/index.ts'],
								['#lib/moderation', 'src/lib/moderation/index.ts'],
								['#lib/moderation/managers', 'src/lib/moderation/managers/index.ts'],
								['#lib/moderation/workers', 'src/lib/moderation/workers/index.ts'],
								['#lib/structures', 'src/lib/structures/index.ts'],
								['#lib/i18n/languageKeys', 'src/lib/i18n/languageKeys/index.ts'],
								['#lib/types', 'src/lib/types/index.ts']
							]);
							const target = aliases.get(source) ?? `src/lib/${source.slice('#lib/'.length)}.ts`;
							return resolve(import.meta.dirname, target);
						}
					},
					{ find: /^#root\/(.*)/, replacement: resolve(import.meta.dirname, 'src/$1.ts') },
					{
						find: '#utils',
						replacement: '#utils',
						customResolver(source) {
							const aliases = new Map([
								['#utils/common', 'src/lib/util/common/index.ts'],
								['#utils/functions', 'src/lib/util/functions/index.ts']
							]);
							const target = aliases.get(source) ?? `src/lib/util/${source.slice('#utils/'.length)}.ts`;
							return resolve(import.meta.dirname, target);
						}
					}
				]
			}),
			copyStaticFiles()
		]
	}
});
