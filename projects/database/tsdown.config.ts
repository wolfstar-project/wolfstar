import { defineConfig } from 'tsdown';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import alias from '@rollup/plugin-alias';

export default defineConfig({
	entry: ['src/index.ts'],
	format: 'esm',
	plugins: [
		alias({
			entries: [
				{
					find: '#lib',
					replacement: '#lib',
					customResolver(source) {
						const subPath = source.replace('#lib/', '');
						return resolve(__dirname, 'src/lib', `${subPath}.ts`);
					}
				}
			]
		})
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
