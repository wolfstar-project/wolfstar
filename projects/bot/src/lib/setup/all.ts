import { getSentryIntegrations } from '#utils/sentry';
import { envParseString } from '@wolfstar/env-utilities';
import { initializeSentry, setInvite, setRepository } from '@wolfstar/shared-http-pieces';
import '#lib/setup/prisma';
import '#lib/setup/redis';
import '#lib/setup/serializers';
// Registers the handlers of the prompts and the paginated messages, the Stars CLI only does it for the plugins:
import '@wolfstar/http-framework-utilities/register';

export function initializeApp() {
	setRepository('wolfstar');
	// The invite asks for no permission: the server owner picks the role of the bot, as for staryl:
	setInvite(envParseString('CLIENT_ID'), '0');
	// Reports the errors to Sentry when `SENTRY_DSN` is set, on the trace of the OpenTelemetry span they happen in:
	initializeSentry({ root: new URL('../../..', import.meta.url), integrations: getSentryIntegrations() });
}
