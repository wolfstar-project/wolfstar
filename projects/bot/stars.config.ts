import alias from '@rollup/plugin-alias';
import { defineConfig } from '@wolfstar/http-framework/config';
import { aliasEntries } from './scripts/aliases';

export default defineConfig({
	codegen: {
		// `Command.OptionsOf<'parent sub'>`, read from the built bot: run `stars build` before `stars codegen`.
		commands: true
	},
	// The environment is described by the Varlock schemas (`src/.env.schema`), see the **Environment (Varlock)** section of AGENTS.md.
	env: { loader: 'varlock' },
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
		],
		// The shared commands, listeners and locales, which `lib/setup/all.ts` used to import through `/register`:
		'@wolfstar/shared-http-pieces/module',
		// Creates `container.influx` and loads the shared Influx listeners when `INFLUX_ENABLED` is on and the credentials are set:
		'@wolfstar/shared-influx-pieces/module',
		// A span for every command and handler (not autocomplete), the parent of the spans of what it runs. The SDK is
		// started by the preload the `start` script loads, and without it the spans cost nothing:
		'@wolfstar/plugin-opentelemetry/module'
	],
	tsdown: {
		plugins: [alias({ entries: aliasEntries })],
		copy: [{ from: 'src/locales', to: 'dist' }]
	}
});
