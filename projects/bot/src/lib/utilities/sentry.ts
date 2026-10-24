import { Sentry } from '@wolfstar/shared-http-pieces';

/**
 * The integrations the bot gives to `initializeSentry`, on top of the ones it sets up itself.
 *
 * @remarks
 *
 * `openTelemetryIntegration` connects Sentry to the OpenTelemetry SDK of `instrumentation.mjs`: what Sentry captures
 * (errors, logs, metrics and check-ins) is put on the trace and the span that are active when it happens, so an error
 * in Sentry has the trace ID of the trace Railway shows. It does nothing when no span is active, as when the SDK did not
 * start or when the code runs outside a request. The spans themselves are sent to Sentry by the SDK
 * (`createSentrySpanExporter` in `instrumentation.mjs`), not by this integration.
 *
 * Sentry 11 does not set up a tracer provider of its own (`enableOpenTelemetrySetup` is off by default), so there is
 * nothing to turn off for the SDK to own it.
 */
export function getSentryIntegrations(): ReturnType<typeof Sentry.openTelemetryIntegration>[] {
	return [Sentry.openTelemetryIntegration()];
}
