import alias from '@rollup/plugin-alias';
import { defineConfig } from '@wolfstar/http-framework/config';
import { aliasEntries } from './scripts/aliases';

export default defineConfig({
	imports: {
		// The barrels are left out: they only export what the other files of `src/lib` already do, and the scanner cannot
		// follow their `export * from '#lib/…'` through the path aliases.
		dirs: ['src/lib/**/!(index).ts'],
		// `Events` is the enum of `#lib/types`, not the one of the framework:
		exclude: ['Events']
	},
	tsdown: {
		plugins: [alias({ entries: aliasEntries })],
		copy: [{ from: 'src/locales', to: 'dist' }]
	}
});
