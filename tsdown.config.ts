import { defineConfig } from 'tsdown';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to resolve import maps (#lib, #utils, etc.) during build
function importMapsResolverPlugin() {
	return {
		name: 'import-maps-resolver',
		resolveId(source: string, importer: string | undefined) {
			// Resolve #lib/* imports
			if (source.startsWith('#lib/')) {
				const path = source.replace('#lib/', '');

				// Try direct .ts file first
				const directFile = resolve(__dirname, 'src/lib', `${path}.ts`);
				if (existsSync(directFile)) {
					return directFile;
				}

				// Try index.ts in directory
				const indexFile = resolve(__dirname, 'src/lib', path, 'index.ts');
				if (existsSync(indexFile)) {
					return indexFile;
				}
			}

			// Resolve #utils/* imports
			if (source.startsWith('#utils/')) {
				const path = source.replace('#utils/', '');

				// Try direct .ts file first
				const directFile = resolve(__dirname, 'src/lib/util', `${path}.ts`);
				if (existsSync(directFile)) {
					return directFile;
				}

				// Try index.ts in directory
				const indexFile = resolve(__dirname, 'src/lib/util', path, 'index.ts');
				if (existsSync(indexFile)) {
					return indexFile;
				}
			}

			// Resolve #languages import
			if (source === '#languages') {
				return resolve(__dirname, 'src/languages/index.ts');
			}

			// Resolve #root/* imports
			if (source.startsWith('#root/')) {
				const path = source.replace('#root/', '');

				// Try direct .ts file first
				const directFile = resolve(__dirname, 'src', `${path}.ts`);
				if (existsSync(directFile)) {
					return directFile;
				}

				// Try index.ts in directory
				const indexFile = resolve(__dirname, 'src', path, 'index.ts');
				if (existsSync(indexFile)) {
					return indexFile;
				}
			}

			return null; // Let other plugins handle this
		}
	};
}

// Plugin to copy .mjs files from src to dist
function copyMjsFilesPlugin() {
	return {
		name: 'copy-mjs-files',
		buildEnd() {
			// Copy worker.mjs to dist
			const srcFile = resolve(__dirname, 'src/lib/moderation/workers/worker.mjs');
			const destDir = resolve(__dirname, 'dist/lib/moderation/workers');
			const destFile = join(destDir, 'worker.mjs');

			if (existsSync(srcFile)) {
				mkdirSync(destDir, { recursive: true });
				copyFileSync(srcFile, destFile);
				console.log('✓ Copied worker.mjs to dist');
			}
		}
	};
}

export default defineConfig({
	// Project entry point - compile all source files
	entry: ['src/**'],

	// Output format: ESM only since package.json has "type": "module"
	format: 'esm',

	// Custom plugin to resolve import maps
	plugins: [importMapsResolverPlugin(), copyMjsFilesPlugin()],

	// Copy raw language JSON files so i18next can load them at runtime
	copy: [{ from: 'src/languages', to: 'dist/languages' }],

	// Output directory
	outDir: 'dist',

	// Generate TypeScript declaration files (.d.ts)
	dts: false,

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

	// Target ES2024
	target: 'es2024',

	// TypeScript configuration
	tsconfig: 'src/tsconfig.json',

	// Enable tree shaking
	treeshake: true,

	// Keep all node_modules external
	skipNodeModulesBundle: true
});
