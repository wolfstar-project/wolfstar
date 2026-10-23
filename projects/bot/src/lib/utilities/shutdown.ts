import { trace } from '@opentelemetry/api';
import { container } from '@wolfstar/http-framework';
import { Logger } from '@wolfstar/plugin-logger';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * How long the spans are given to be exported when the process stops, so a receiver that does not answer does not keep
 * a deploy waiting.
 */
const TraceFlushTimeout = 5_000;

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
 * Exports the spans the OpenTelemetry SDK (`instrumentation.mjs`) still holds: it sends them in batches, and the SDK
 * shuts down on `SIGTERM` by itself, but the process exits before that is done.
 *
 * @remarks
 *
 * It does nothing when the SDK did not start, since the tracer provider is then the no-op one, and it never throws.
 */
export async function flushTraces() {
	// The global provider is a proxy, whose delegate is the one of the SDK:
	const proxy = trace.getTracerProvider() as { getDelegate?: () => object };
	const provider = (proxy.getDelegate?.() ?? proxy) as { forceFlush?: () => Promise<void> };
	if (typeof provider.forceFlush !== 'function') return;

	try {
		await Promise.race([provider.forceFlush(), sleep(TraceFlushTimeout, undefined, { ref: false })]);
	} catch {
		// Nothing to do about a span that cannot be exported while exiting.
	}
}

/**
 * Closes the logger and exports the last spans, see {@linkcode closeLogger} and {@linkcode flushTraces}.
 */
export async function closeTelemetry() {
	await Promise.all([closeLogger(), flushTraces()]);
}

/**
 * Closes the logger, exports the last spans and exits when the process is asked to stop (`SIGTERM` from a deploy,
 * `SIGINT`). A process that has a handler for the signal does not stop by itself, hence the exit, which is what the
 * default handler would have done.
 */
export function closeLoggerOnShutdown() {
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => void closeTelemetry().finally(() => process.exit(0)));
	}
}
