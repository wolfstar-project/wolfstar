import '#lib/setup';

import { WolfClient } from '#lib/WolfClient';
import { rootFolder } from '#utils/constants';
import { container } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import { envIsDefined, envParseString } from '@skyra/env-utilities';

const client = new WolfClient();

// Load in Sentry for error logging
if (envIsDefined('SENTRY_URL')) {
	Sentry.init({
		dsn: envParseString('SENTRY_URL'),
		integrations: [
			Sentry.consoleIntegration(),
			Sentry.functionToStringIntegration(),
			Sentry.linkedErrorsIntegration(),
			Sentry.modulesIntegration(),
			Sentry.onUncaughtExceptionIntegration(),
			Sentry.onUnhandledRejectionIntegration(),
			Sentry.httpIntegration({ breadcrumbs: true }),
			Sentry.prismaIntegration(),
			Sentry.rewriteFramesIntegration({ root: rootFolder })
		]
	});
}

try {
	// Login to the Discord gateway
	await client.login();
} catch (error) {
	container.logger.error(error);
	await client.destroy();
	process.exit(1);
}
