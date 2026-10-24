import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: 'esm',
	dts: true,
	unbundle: true,
	sourcemap: true,
	minify: false,
	platform: 'node',
	tsconfig: 'src/tsconfig.json',
	treeshake: true,
	deps: { neverBundle: true }
});
