import { createEnvironmentSpanExporter, createSentrySpanExporter } from '../instrumentation.mjs';
import { OTLPTraceExporter as GrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import type { SpanExporter } from '@opentelemetry/sdk-trace';
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

describe('createEnvironmentSpanExporter', () => {
	const received: Received[] = [];
	let server: Server;
	let port: number;

	// Railway's receiver:
	beforeAll(async () => {
		server = createServer((request, response) => {
			request.resume();
			request.on('end', () => {
				received.push({ url: request.url ?? '', headers: request.headers, body: '' });
				response.writeHead(200).end();
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
		vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', `http://127.0.0.1:${port}`);
		vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', 'Authorization=Bearer railway-token');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function exportOneSpan(exporter: SpanExporter) {
		const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
		provider.getTracer('test').startSpan('interaction').end();
		await provider.forceFlush();
		await provider.shutdown();
		return received[0];
	}

	test.each([
		['no protocol, as Railway sets http/protobuf', undefined, undefined, 'application/x-protobuf'],
		['http/protobuf', 'http/protobuf', undefined, 'application/x-protobuf'],
		['http/json', 'http/json', undefined, 'application/json'],
		['http/json for the traces only', 'http/protobuf', 'http/json', 'application/json'],
		['a protocol it does not know', 'carrier-pigeon', undefined, 'application/x-protobuf']
	])(
		'GIVEN %s THEN the spans go to the endpoint of the environment with its headers, in the encoding of the protocol',
		async (_name, protocol, tracesProtocol, contentType) => {
			if (protocol) vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', protocol);
			if (tracesProtocol) vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', tracesProtocol);

			const request = await exportOneSpan(await createEnvironmentSpanExporter());

			expect(request.url).toBe('/v1/traces');
			expect(request.headers['content-type']).toBe(contentType);
			expect(request.headers.authorization).toBe('Bearer railway-token');
		}
	);

	test('GIVEN grpc THEN the exporter is the one of gRPC', async () => {
		vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', 'grpc');

		const exporter = await createEnvironmentSpanExporter();
		expect(exporter).toBeInstanceOf(GrpcTraceExporter);
		await exporter.shutdown();
	});
});
