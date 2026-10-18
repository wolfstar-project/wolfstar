import alias from '@rollup/plugin-alias';
import { defineConfig } from '@wolfstar/http-framework/config';
import { aliasEntries } from './scripts/aliases';

export default defineConfig({
	codegen: {
		// `Command.OptionsOf<'parent sub'>`, read from the built bot: run `stars build` before `stars codegen`.
		commands: true
	},
	imports: {
		// The barrels are left out: they only export what the other files of `src/lib` already do, and the scanner cannot
		// follow their `export * from '#lib/…'` through the path aliases.
		dirs: ['src/lib/**/!(index).ts'],
		// The defaults, and the utilities of `projects/shared`, which used to be in `src/lib`:
		presets: ['@wolfstar/http-framework', '@wolfstar/decorators', '@wolfstar/env-utilities', 'wolfstar-shared'],
		// `Events` is the enum of `#lib/types`, not the one of the framework:
		exclude: ['Events']
	},
	modules: [
		[
			// Takes the place of the `/register` import the CLI injects for `@wolfstar/plugin-logger`. evlog prints the logs
			// itself and delivers them to the drain of `src/evlog-drain.ts` (Sentry logs), batched and retried by the
			// pipeline, with one wide event for every interaction. The options are written into the build, so no secret
			// goes here: the drain reads the DSN from the environment.
			'@wolfstar/plugin-logger/module',
			{ evlog: { env: { service: 'wolfstar' }, pipeline: true, drain: './src/evlog-drain.ts' } }
		]
	],
	tsdown: {
		plugins: [alias({ entries: aliasEntries })],
		copy: [{ from: 'src/locales', to: 'dist' }]
	}
});
