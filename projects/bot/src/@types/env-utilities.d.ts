import type { EnvFromVarlock } from '@wolfstar/env-utilities/varlock';
import type { CoercedEnvSchema } from './env.js';

/**
 * Types the keys of the `envParse*` functions from the Varlock schema (`src/.env.schema`), through the `env.d.ts` that
 * Varlock generates from it: booleans become a `BooleanString`, integers and ports an `IntegerString`, the rest stays a
 * string, and what the schema marks as optional stays optional. Declare a variable in the schema, never in here.
 */
declare module '@wolfstar/env-utilities' {
	// oxlint-disable-next-line typescript/no-empty-object-type, typescript/no-empty-interface
	interface Env extends EnvFromVarlock<CoercedEnvSchema> {}
}
