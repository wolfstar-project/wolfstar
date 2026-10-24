// Starts the OpenTelemetry SDK before the bot, loaded with `--import` by the `start` script: an instrumentation only
// patches a library that is imported after it, so it has to run before `dist/main.mjs` imports anything.
//
// It does nothing unless an OTLP endpoint is set, which Railway does when tracing is on for the service (with the
// protocol, the headers, the name and the version of the service): the exporter of Railway reads all of it from the
// environment, and nothing here names an endpoint. Without one, as when the bot runs locally, the SDK would export to
// localhost.
//
// A worker thread inherits `--import` too: the regular expression workers of the moderation would each start an SDK,
// take seconds to answer their first message and hold hundreds of megabytes, so the SDK only starts on the main thread.
import { isMainThread } from 'node:worker_threads';

if (isMainThread && (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)) {
	// The bot is ES modules: without the loader hook of `import-in-the-middle`, the libraries it imports (`pg` under
	// Prisma, `ioredis`, `undici`) stay unpatched and only the spans of the `http` server appear.
	const { register } = await import('node:module');
	register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

	await startTracing();
}

/**
 * Starts the SDK with the automatic instrumentations, the W3C trace context propagator and an exporter for each place
 * the spans go to: Railway, configured by the environment, and Sentry, when `SENTRY_DSN` is set.
 *
 * @returns The SDK, which is shut down on `SIGTERM` to export the last spans.
 */
export async function startTracing() {
	const [{ NodeSDK }, { getNodeAutoInstrumentations, getResourceDetectors }, { BatchSpanProcessor }] = await Promise.all([
		import('@opentelemetry/sdk-node'),
		import('@opentelemetry/auto-instrumentations-node'),
		import('@opentelemetry/sdk-trace')
	]);

	// The SDK only builds the exporter of the environment when it is given no span processor, so it is built here:
	const spanProcessors = [new BatchSpanProcessor({ exporter: await createEnvironmentSpanExporter() })];
	const sentry = await createSentrySpanExporter(process.env.SENTRY_DSN);
	if (sentry) spanProcessors.push(new BatchSpanProcessor({ exporter: sentry }));

	const sdk = new NodeSDK({
		instrumentations: getNodeAutoInstrumentations(getInstrumentationConfig()),
		resourceDetectors: getResourceDetectors(),
		spanProcessors
	});
	sdk.start();

	const shutdown = () => sdk.shutdown().catch(() => undefined);
	process.on('SIGTERM', shutdown);
	process.once('beforeExit', shutdown);
	return sdk;
}

/**
 * The configuration of the automatic instrumentations that differs from their defaults.
 *
 * @remarks The URL of a request to a webhook of Discord holds its token, and so does the answer to an interaction: the
 * logs sent through the webhook of their channel, and the follow-ups of a command, would put a token that lets anybody
 * post there in every span of `undici`, which go to Railway and to Sentry. The token is replaced before the span starts.
 */
export function getInstrumentationConfig() {
	return {
		'@opentelemetry/instrumentation-undici': {
			startSpanHook: (request) => {
				const url = new URL(request.path, request.origin);
				url.pathname = redactDiscordTokens(url.pathname);
				return { 'url.full': url.toString(), 'url.path': url.pathname };
			}
		}
	};
}

/**
 * Replaces the token in the path of a request to a webhook or an interaction of Discord
 * (`/webhooks/<id>/<token>`, `/interactions/<id>/<token>`) with `REDACTED`.
 */
export function redactDiscordTokens(path) {
	return path.replace(/\/(webhooks|interactions)\/(\d+)\/[^/?#]+/g, '/$1/$2/REDACTED');
}

/**
 * Creates the exporter the environment configures, Railway's: the endpoint, the headers and the protocol are read from
 * the `OTEL_EXPORTER_OTLP_*` variables, and the protocol picks the exporter as the SDK does (`http/protobuf`, which
 * Railway sets, when none is given, and with a warning when it is not one of the three).
 */
export async function createEnvironmentSpanExporter() {
	const protocol = process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL || process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf';
	switch (protocol) {
		case 'grpc':
			return new (await import('@opentelemetry/exporter-trace-otlp-grpc')).OTLPTraceExporter();
		case 'http/json':
			return new (await import('@opentelemetry/exporter-trace-otlp-http')).OTLPTraceExporter();
		case 'http/protobuf':
			return new (await import('@opentelemetry/exporter-trace-otlp-proto')).OTLPTraceExporter();
		default: {
			// The SDK has no logger yet, so `diag` would print nothing:
			console.warn(`Unsupported OTLP traces protocol: ${protocol}. Using http/protobuf.`);
			return new (await import('@opentelemetry/exporter-trace-otlp-proto')).OTLPTraceExporter();
		}
	}
}

/**
 * Creates the exporter that sends the spans to the OTLP endpoint of the Sentry project of a DSN, as JSON (the encoding
 * the documentation of Sentry shows).
 *
 * @remarks
 *
 * An OTLP exporter reads the `OTEL_EXPORTER_OTLP_*` variables when it is created, and adds their headers to the ones it
 * is given. Those are the headers of Railway, with its token, so the variables are hidden while the exporter is created:
 * it only has the URL and the header of Sentry.
 *
 * @param dsn - The DSN of the Sentry project.
 * @returns The exporter, `undefined` without a DSN or with one that cannot be read.
 */
export async function createSentrySpanExporter(dsn) {
	if (!dsn) return undefined;

	const [{ Sentry }, { OTLPTraceExporter }] = await Promise.all([
		import('@wolfstar/shared-http-pieces'),
		import('@opentelemetry/exporter-trace-otlp-http')
	]);
	const endpoint = Sentry.getOtlpTracesEndpoint(dsn);
	if (!endpoint) return undefined;

	return withoutOtlpEnvironment(() => new OTLPTraceExporter(endpoint));
}

/**
 * Runs a function with the `OTEL_EXPORTER_OTLP_*` variables taken out of the environment, and puts them back after.
 */
function withoutOtlpEnvironment(create) {
	const hidden = Object.entries(process.env).filter(([name]) => name.startsWith('OTEL_EXPORTER_OTLP_'));
	for (const [name] of hidden) delete process.env[name];

	try {
		return create();
	} finally {
		for (const [name, value] of hidden) process.env[name] = value;
	}
}
