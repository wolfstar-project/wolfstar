// Starts the OpenTelemetry SDK before the bot, loaded with `--import` by the `start` script: an instrumentation only
// patches a library that is imported after it, so it has to run before `dist/main.mjs` imports anything.
//
// It does nothing unless an OTLP endpoint is set, which Railway does when tracing is on for the service (with the
// protocol, the headers, the name and the version of the service): the SDK reads all of it from the environment, and
// nothing here names an endpoint. Without one, as when the bot runs locally, the SDK would export to localhost.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
	// The bot is ES modules: without the loader hook of `import-in-the-middle`, the libraries it imports (`pg` under
	// Prisma, `ioredis`, `undici`) stay unpatched and only the spans of the `http` server appear.
	const { register } = await import('node:module');
	register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

	// The automatic instrumentations, the exporter and the W3C trace context propagator, configured from the environment;
	// it shuts the SDK down on `SIGTERM`, which exports the last spans.
	await import('@opentelemetry/auto-instrumentations-node/register');
}
