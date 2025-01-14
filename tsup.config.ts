import { defineConfig } from 'tsup';

export default defineConfig({
	clean: true,
	bundle: false,
	dts: false,
	entry: ['src/**/*.{mjs,ts}', '!src/**/*.d.ts'],
	format: ['esm'],
	minify: false,
	tsconfig: 'src/tsconfig.json',
	target: 'node22',
	splitting: true,
	skipNodeModulesBundle: true,
	sourcemap: true,
	shims: true,
	keepNames: true
});
