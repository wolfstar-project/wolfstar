import { defineConfig } from 'golar/unstable';

export default defineConfig({
	typecheck: {
		include: ['./projects/*/src/**/*.{ts,mts}', './projects/*/tests/**/*.ts', './scripts/**/*.ts'],
		exclude: ['**/node_modules', '**/dist', './projects/database/src/generated/**', './projects/bot/.stars/**']
	}
});
