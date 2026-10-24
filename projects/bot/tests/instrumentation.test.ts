import { createSentrySpanExporter } from '../instrumentation.mjs';
import { SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

interface Received {
	url: string;
	headers: IncomingHttpHeaders;
	body: string;
}

describe('createSentrySpanExporter', () => {
	const received: Received[] = [];
	let server: Server;
	let port: number;

	beforeAll(async () => {
		// The OTLP endpoint of Sentry, which answers every export:
		server = createServer((request, response) => {
			let body = '';
			request.on('data', (chunk: Buffer) => (body += chunk.toString()));
			request.on('end', () => {
				received.push({ url: request.url ?? '', headers: request.headers, body });
				response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
			});
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		({ port } = server.address() as AddressInfo);
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		received.length = 0;
		// What Railway sets when tracing is on, its token included:
		vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://127.0.0.1:1');
		vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', 'Authorization=Bearer railway-token');
		vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_HEADERS', 'X-Railway-Project=star-network');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test('GIVEN no DSN THEN no span goes to Sentry', async () => {
		await expect(createSentrySpanExporter(undefined)).resolves.toBeUndefined();
		await expect(createSentrySpanExporter('')).resolves.toBeUndefined();
	});

	test('GIVEN a DSN THEN the spans go to the OTLP endpoint of its project, with the key of Sentry and not the headers of Railway', async () => {
		const exporter = await createSentrySpanExporter(`http://publickey@127.0.0.1:${port}/42`);
		expect(exporter).toBeDefined();

		const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: exporter! })] });
		provider.getTracer('test').startSpan('interaction').end();
		await provider.forceFlush();
		await provider.shutdown();

		expect(received).toHaveLength(1);
		expect(received[0].url).toBe('/api/42/integration/otlp/v1/traces/');
		expect(received[0].headers['x-sentry-auth']).toContain('sentry_key=publickey');
		expect(received[0].headers['content-type']).toBe('application/json');
		expect(received[0].headers.authorization).toBeUndefined();
		expect(received[0].headers['x-railway-project']).toBeUndefined();
		expect(received[0].body).toContain('interaction');
	});

	test('GIVEN the exporter of Sentry is created THEN the variables of Railway are back in the environment', async () => {
		await createSentrySpanExporter(`http://publickey@127.0.0.1:${port}/42`);

		expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://127.0.0.1:1');
		expect(process.env.OTEL_EXPORTER_OTLP_HEADERS).toBe('Authorization=Bearer railway-token');
		expect(process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS).toBe('X-Railway-Project=star-network');
	});
});
