import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';

const compat = new FlatCompat();

export default defineConfig([
	// Ignore patterns (replaces .eslintignore)
	globalIgnores(['node_modules/**', 'dist/**']),

	// Sapphire config via FlatCompat
	...compat.extends('@sapphire/eslint-config'),

	// Main source and test files
	{
		files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs', 'scripts/**/*.js'],
		rules: {
			'@typescript-eslint/no-base-to-string': 'off',
			'@typescript-eslint/no-throw-literal': 'off',
			'no-catch-shadow': 'off'
		}
	},

	// Command files and jest configs - disable require-await
	{
		files: ['src/commands/**/*.ts'],
		rules: {
			'@typescript-eslint/require-await': 'off'
		}
	},

	// Prettier config (must be last to override formatting rules)
	prettierConfig
]);
