// Starts the OpenTelemetry SDK before the bot, loaded with `--import` by the `start` script: an instrumentation only
// patches a library that is imported after it, so it has to run before `dist/main.mjs` imports anything.
//
// It does nothing unless an OTLP endpoint is set, which Railway does when tracing is on for the service (with the
// protocol, the headers, the name and the version of the service): the exporter of Railway reads all of it from the
// environment, and nothing here names an endpoint. Without one, as when the bot runs locally, the SDK would export to
// localhost.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
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
	const [{ NodeSDK }, { getNodeAutoInstrumentations, getResourceDetectors }, { BatchSpanProcessor }, { OTLPTraceExporter }] = await Promise.all([
		import('@opentelemetry/sdk-node'),
		import('@opentelemetry/auto-instrumentations-node'),
		import('@opentelemetry/sdk-trace'),
		import('@opentelemetry/exporter-trace-otlp-proto')
	]);

	// The SDK only builds the exporter of the environment when it is given no span processor, so it is built here:
	const spanProcessors = [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })];
	const sentry = await createSentrySpanExporter(process.env.SENTRY_DSN);
	if (sentry) spanProcessors.push(new BatchSpanProcessor({ exporter: sentry }));

	const sdk = new NodeSDK({ instrumentations: getNodeAutoInstrumentations(), resourceDetectors: getResourceDetectors(), spanProcessors });
	sdk.start();

	const shutdown = () => sdk.shutdown().catch(() => undefined);
	process.on('SIGTERM', shutdown);
	process.once('beforeExit', shutdown);
	return sdk;
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
