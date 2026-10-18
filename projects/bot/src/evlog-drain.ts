import { envParseString } from '@wolfstar/env-utilities';
import { defineEvlogDrain } from '@wolfstar/plugin-logger/evlog/plugin';
import type { DrainContext } from 'evlog';
import { createSentryDrain } from 'evlog/sentry';

// The drain of the evlog option of the logger module in `stars.config.ts`, which cannot hold a function. The DSN is a
// secret and the options of a module are written into the build, so it is never given here: the drain reads
// `SENTRY_DSN` when it first sends, the same variable `initializeSentry` of `@wolfstar/shared-http-pieces` reads.
const sentry = createSentryDrain();

export default defineEvlogDrain(async (batch: DrainContext[]) => {
	// Without a DSN the drain would print a missing DSN error for every batch:
	if (!envParseString('SENTRY_DSN', '')) return;
	await sentry(batch);
});
