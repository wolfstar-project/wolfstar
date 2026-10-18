import { container } from '@wolfstar/http-framework';
import { Logger } from '@wolfstar/plugin-logger';

/**
 * Closes the logger, which flushes what its transports buffered: the evlog drain delivers its events in batches, so the
 * last ones are lost when the process exits before that.
 *
 * @remarks
 *
 * It never throws, since it runs while the process is shutting down.
 */
export async function closeLogger() {
	try {
		// `container.logger` is typed as the framework's `ILogger`, which has no `close`:
		if (container.logger instanceof Logger) await container.logger.close();
	} catch {
		// Nothing to do about a log that cannot be delivered while exiting.
	}
}

/**
 * Closes the logger and exits when the process is asked to stop (`SIGTERM` from a deploy, `SIGINT`). A process that has
 * a handler for the signal does not stop by itself, hence the exit, which is what the default handler would have done.
 */
export function closeLoggerOnShutdown() {
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => void closeLogger().finally(() => process.exit(0)));
	}
}
