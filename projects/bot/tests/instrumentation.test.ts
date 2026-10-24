import {
	createEnvironmentSpanExporter,
	createSentrySpanExporter,
	getInstrumentationConfig,
	isSentryEnvelopeRequest,
	isWebSocketHandshake,
	redactDiscordTokens
} from '../instrumentation.mjs';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { OTLPTraceExporter as GrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import type { SpanExporter } from '@opentelemetry/sdk-trace';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
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

describe('redactDiscordTokens', () => {
	test.each([
		['/api/v10/webhooks/1/secret-token', '/api/v10/webhooks/1/REDACTED'],
		['/api/v10/webhooks/1/secret-token/messages/2', '/api/v10/webhooks/1/REDACTED/messages/2'],
		['/api/v10/webhooks/1/secret-token/messages/@original', '/api/v10/webhooks/1/REDACTED/messages/@original'],
		['/api/v10/interactions/1/secret-token/callback', '/api/v10/interactions/1/REDACTED/callback'],
		['/api/v10/channels/1/webhooks', '/api/v10/channels/1/webhooks'],
		['/api/v10/webhooks/1', '/api/v10/webhooks/1'],
		['/api/v10/channels/1/messages', '/api/v10/channels/1/messages']
	])('GIVEN %s THEN it becomes %s', (path, expected) => {
		expect(redactDiscordTokens(path)).toBe(expected);
	});
});

describe('the instrumentation of undici', () => {
	const exporter = new InMemorySpanExporter();
	const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
	const instrumentation = new UndiciInstrumentation(getInstrumentationConfig(undefined)['@opentelemetry/instrumentation-undici']);
	let server: Server;
	let port: number;

	beforeAll(async () => {
		instrumentation.setTracerProvider(provider);
		instrumentation.enable();
		server = createServer((request, response) => {
			request.resume();
			request.on('end', () => response.writeHead(204).end());
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		({ port } = server.address() as AddressInfo);
	});

	afterAll(async () => {
		instrumentation.disable();
		await provider.shutdown();
		await new Promise((resolve) => server.close(resolve));
	});

	// A log sent through the webhook of its channel, and the answer to an interaction, carry their token in the URL:
	test('GIVEN a request to a webhook of Discord THEN its span does not hold the token', async () => {
		await fetch(`http://127.0.0.1:${port}/api/v10/webhooks/1/secret-token?wait=true`, { method: 'POST' });
		await provider.forceFlush();

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(JSON.stringify(spans[0].attributes)).not.toContain('secret-token');
		expect(spans[0].attributes['url.path']).toBe('/api/v10/webhooks/1/REDACTED');
		expect(spans[0].attributes['url.full']).toBe(`http://127.0.0.1:${port}/api/v10/webhooks/1/REDACTED?wait=true`);
	});
});

describe('isSentryEnvelopeRequest', () => {
	const dsn = 'https://publickey@o0.ingest.sentry.io/42';

	// What the transport of Sentry gives `https.request`, its key in the query:
	test.each([
		['the envelope of Sentry', { hostname: 'o0.ingest.sentry.io', path: '/api/42/envelope/?sentry_version=7&sentry_key=publickey' }, true],
		['the envelope with the port in the host', { host: 'o0.ingest.sentry.io:443', path: '/api/42/envelope/?sentry_key=publickey' }, true],
		['another request to the host of Sentry', { hostname: 'o0.ingest.sentry.io', path: '/api/42/security/' }, false],
		['another host with the same path', { hostname: 'influx.example.com', path: '/api/42/envelope/' }, false]
	])('GIVEN %s THEN it is told apart from the other requests', (_name, request, expected) => {
		expect(isSentryEnvelopeRequest(request, dsn)).toBe(expected);
	});

	test('GIVEN a DSN with a path, as a Sentry hosted under one THEN only the envelope of its project is one of Sentry', () => {
		const hosted = 'https://publickey@sentry.example.com/sentry/42';
		expect(isSentryEnvelopeRequest({ hostname: 'sentry.example.com', path: '/sentry/api/42/envelope/?sentry_key=publickey' }, hosted)).toBe(true);
		expect(isSentryEnvelopeRequest({ hostname: 'sentry.example.com', path: '/api/42/envelope/' }, hosted)).toBe(false);
		expect(isSentryEnvelopeRequest({ hostname: 'sentry.example.com', path: '/sentry/api/7/envelope/' }, hosted)).toBe(false);
	});

	test('GIVEN the envelope of another project on the same host THEN it is not the one of the DSN', () => {
		expect(isSentryEnvelopeRequest({ hostname: 'o0.ingest.sentry.io', path: '/api/7/envelope/' }, dsn)).toBe(false);
	});

	test('GIVEN no DSN, or one that cannot be read THEN no request is one of Sentry', () => {
		const request = { hostname: 'o0.ingest.sentry.io', path: '/api/42/envelope/' };
		expect(isSentryEnvelopeRequest(request, undefined)).toBe(false);
		expect(isSentryEnvelopeRequest(request, 'not a dsn')).toBe(false);
	});

	test('GIVEN the configuration of the instrumentations THEN the http one leaves the transport of Sentry out', () => {
		const { ignoreOutgoingRequestHook } = getInstrumentationConfig(dsn)['@opentelemetry/instrumentation-http'];
		expect(ignoreOutgoingRequestHook({ hostname: 'o0.ingest.sentry.io', path: '/api/42/envelope/?sentry_key=publickey' })).toBe(true);
		expect(ignoreOutgoingRequestHook({ hostname: 'influx.example.com', path: '/api/v2/write' })).toBe(false);
	});
});

describe('the preload in a worker thread', () => {
	// The regular expression workers of the moderation inherit `--import`, and must not start an SDK each:
	test('GIVEN a worker thread THEN the SDK does not start in it', async () => {
		const worker = new Worker(new URL('mocks/tracerProviderWorker.mjs', import.meta.url), {
			execArgv: ['--import', new URL('../instrumentation.mjs', import.meta.url).href],
			env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1', SENTRY_DSN: '' }
		});

		const started = await new Promise<boolean>((resolve, reject) => {
			worker.once('message', resolve);
			worker.once('error', reject);
		});
		await worker.terminate();

		expect(started).toBe(false);
	});
});

describe('the preload on SIGTERM', () => {
	// The OTLP endpoint does not answer: the export fails at once, and nothing else keeps the process up.
	const env = {
		...process.env,
		OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1',
		OTEL_METRICS_EXPORTER: 'none',
		OTEL_LOGS_EXPORTER: 'none',
		OTEL_NODE_RESOURCE_DETECTORS: 'none',
		SENTRY_DSN: ''
	};

	function terminate(mode: string) {
		const child = spawn(
			process.execPath,
			[
				'--import',
				new URL('../instrumentation.mjs', import.meta.url).href,
				new URL('mocks/sigtermProcess.mjs', import.meta.url).pathname,
				mode
			],
			{ env, stdio: ['ignore', 'pipe', 'ignore'] }
		);

		return new Promise<NodeJS.Signals | null>((resolve, reject) => {
			const timer = setTimeout(() => {
				child.kill('SIGKILL');
				reject(new Error('The process is still running after SIGTERM.'));
			}, 8000);
			child.stdout.once('data', () => child.kill('SIGTERM'));
			child.once('exit', (_code, signal) => {
				clearTimeout(timer);
				resolve(signal);
			});
		});
	}

	test('GIVEN a process whose other handler raises the signal again once nothing listens (the broker consumer of a worker) THEN it still ends', async () => {
		await expect(terminate('broker')).resolves.toBe('SIGTERM');
	}, 10_000);

	test('GIVEN a process with no other handler THEN it ends as the signal ends it, once the spans are exported', async () => {
		await expect(terminate('alone')).resolves.toBe('SIGTERM');
	}, 10_000);
});

describe('the preload on a WebSocket', () => {
	// The connection of the gateway lasts for hours, and the dispatches handled meanwhile ran in its context: every span of
	// the bot ended up in one trace that never closed.
	test('GIVEN the handshake of a WebSocket THEN it is not traced, and a regular request is', async () => {
		const urls: string[] = [];
		const receiver = createServer((request, response) => {
			let body = '';
			request.on('data', (chunk: Buffer) => (body += chunk.toString()));
			request.on('end', () => {
				const { resourceSpans } = JSON.parse(body) as {
					resourceSpans: { scopeSpans: { spans: { attributes: { key: string; value: { stringValue?: string } }[] }[] }[] }[];
				};
				for (const span of resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans))) {
					const url = span.attributes.find((attribute) => attribute.key === 'url.full')?.value.stringValue;
					if (url) urls.push(new URL(url).pathname + new URL(url).search);
				}
				response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
			});
		});
		await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
		const { port } = receiver.address() as AddressInfo;

		const child = spawn(
			process.execPath,
			['--import', new URL('../instrumentation.mjs', import.meta.url).href, new URL('mocks/websocketHandshake.mjs', import.meta.url).pathname],
			{
				env: {
					...process.env,
					OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
					OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
					OTEL_METRICS_EXPORTER: 'none',
					OTEL_LOGS_EXPORTER: 'none',
					OTEL_NODE_RESOURCE_DETECTORS: 'none',
					OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'net,dns',
					SENTRY_DSN: ''
				},
				stdio: 'ignore'
			}
		);
		const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
		await new Promise((resolve) => receiver.close(resolve));

		expect(code).toBe(0);
		expect(urls).toContain('/api/v10/gateway/bot');
		expect(urls).not.toContain('/?v=10&encoding=json');
	}, 15_000);
});

describe('isWebSocketHandshake', () => {
	test.each([
		['the handshake of `ws`', { headers: { Connection: 'Upgrade', Upgrade: 'websocket' } }, true],
		['an upgrade header in lower case', { headers: { upgrade: 'WebSocket' } }, true],
		['a regular request', { headers: { 'Content-Type': 'application/json' } }, false],
		['a request with no headers', {}, false]
	])('GIVEN %s THEN it is told apart from the other requests', (_name, request, expected) => {
		expect(isWebSocketHandshake(request)).toBe(expected);
	});
});
