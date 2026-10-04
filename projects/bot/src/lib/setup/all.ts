import { envParseString } from '@wolfstar/env-utilities';
import { initializeSentry, setInvite, setRepository } from '@wolfstar/shared-http-pieces';
import '#lib/setup/prisma';
import '#lib/setup/redis';
import '@wolfstar/shared-http-pieces/register';
// Registers the handlers of the prompts and the paginated messages, the Stars CLI only does it for the plugins:
import '@wolfstar/http-framework-utilities/register';

export function initializeApp() {
	setRepository('wolfstar');
	setInvite(envParseString('CLIENT_ID'), '0');
	// Reports the errors to Sentry when `SENTRY_DSN` is set:
	initializeSentry({ root: new URL('../../..', import.meta.url) });
}
