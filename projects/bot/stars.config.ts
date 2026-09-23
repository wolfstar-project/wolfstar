import alias from '@rollup/plugin-alias';
import { defineConfig } from '@wolfstar/http-framework/config';
import { aliasEntries } from './scripts/aliases.ts';

export default defineConfig({
	entry: 'src/main.ts',
	future: { compatibilityVersion: 4 },
	imports: {
		// Legacy modules still export many duplicate names; keep the framework presets
		// enabled without scanning the application itself until that migration is complete.
		dirs: []
	},
	tsdown: {
		plugins: [alias({ entries: aliasEntries })],
		copy: [{ from: 'src/locales', to: 'dist' }]
	}
});
