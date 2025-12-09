import { defineConfig } from 'tsdown';

export default defineConfig({
	// Project entry point
	entry: ['src/index.ts'],

	// Output format: ESM only since package.json has "type": "module"
	format: ['esm'],

	// Output directory
	outDir: 'dist',

	// Generate TypeScript declaration files (.d.ts)
	dts: true,

	// Maintain the directory structure from src
	unbundle: true,

	// Clean output directory before build
	clean: true,

	// Generate sourcemaps
	sourcemap: true,

	// Don't minify for easier debugging
	minify: false,

	// Target platform
	platform: 'node',

	// Node.js target based on engines in package.json
	target: 'node20',

	// TypeScript configuration
	tsconfig: 'src/tsconfig.json',

	// Keep all node_modules external
	skipNodeModulesBundle: true
});
