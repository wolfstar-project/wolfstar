import { envParseString } from '@wolfstar/env-utilities';
import { initializeSentry, setInvite, setRepository } from '@wolfstar/shared-http-pieces';
import '#lib/setup/prisma';
import '#lib/setup/redis';

export function initializeApp() {
	setRepository('wolfstar');
	setInvite(envParseString('CLIENT_ID'), '0');
	// Reports the errors to Sentry when `SENTRY_DSN` is set:
	initializeSentry({ root: new URL('../../..', import.meta.url) });
}
