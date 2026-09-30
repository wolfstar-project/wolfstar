import alias from '@rollup/plugin-alias';
import { defineConfig } from '@wolfstar/http-framework/config';
import { aliasEntries } from './scripts/aliases';

export default defineConfig({
	tsdown: {
		plugins: [alias({ entries: aliasEntries })],
		copy: [{ from: 'src/locales', to: 'dist' }]
	}
});
