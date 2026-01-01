import { defineConfig } from 'tsdown';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, copyFileSync, mkdirSync, cpSync } from 'node:fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to resolve import maps (#lib, #utils, etc.) during build
function importMapsResolverPlugin() {
	return {
		name: 'import-maps-resolver',
		resolveId(source: string) {
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

				// Fallback: return the path without extension for directory resolution
				return resolve(__dirname, 'src/lib', path);
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

				// Fallback: return the path without extension for directory resolution
				return resolve(__dirname, 'src/lib/util', path);
			}

			// Resolve #languages import
			if (source === '#languages') {
				const file = resolve(__dirname, 'src/languages/index.ts');
				if (existsSync(file)) {
					return file;
				}
				return resolve(__dirname, 'src/languages');
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

				// Fallback: return the path without extension for directory resolution
				return resolve(__dirname, 'src', path);
			}

			return null; // Let other plugins handle this
		}
	};
}

// Plugin to copy .mjs files from src to dist
function copyPlugin() {
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
	plugins: [importMapsResolverPlugin(), copyPlugin()],
	dts: true,
	unbundle: true,
	sourcemap: true,
	minify: false,
	platform: 'node',
	tsconfig: 'src/tsconfig.json',
	treeshake: true,
	skipNodeModulesBundle: true,
	alias: {
		'#lib': resolve(__dirname, 'src/lib'),
		'#utils': resolve(__dirname, 'src/lib/util'),
		'#languages': resolve(__dirname, 'src/languages'),
		'#root': resolve(__dirname, 'src')
	}
});
