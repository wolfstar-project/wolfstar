import '#mocks/MockInstances';
import { createTracedListener, ListenerAttributes, traceClientListeners } from '#utils/listenerTracing';
import { container, type Listener } from '@wolfstar/http-framework';
import { SpanStatusCode, trace, type Span, type SpanOptions, type Tracer, type TracerProvider } from '@opentelemetry/api';

interface RecordedSpan {
	name: string;
	attributes: Record<string, unknown>;
	status: SpanStatusCode | null;
	exceptions: unknown[];
	ended: boolean;
}

const spans: RecordedSpan[] = [];

function createRecordingSpan(record: RecordedSpan): Span {
	const span = {
		setAttribute(key: string, value: unknown) {
			record.attributes[key] = value;
			return span;
		},
		setStatus(status: { code: SpanStatusCode }) {
			record.status = status.code;
			return span;
		},
		recordException(exception: unknown) {
			record.exceptions.push(exception);
		},
		end() {
			record.ended = true;
		}
	};
	return span as unknown as Span;
}

const tracer = {
	startActiveSpan(name: string, options: SpanOptions, fn: (span: Span) => unknown) {
		const record: RecordedSpan = { name, attributes: { ...options.attributes }, status: null, exceptions: [], ended: false };
		spans.push(record);
		return fn(createRecordingSpan(record));
	}
} as unknown as Tracer;

const provider: TracerProvider = { getTracer: () => tracer };

beforeAll(() => {
	trace.setGlobalTracerProvider(provider);
});

afterAll(() => {
	trace.disable();
});

beforeEach(() => {
	spans.length = 0;
});

describe('createTracedListener', () => {
	it('runs the listener with its arguments in a span named after the event and the piece', () => {
		const listener = vi.fn((a: unknown, b: unknown) => `${String(a)}-${String(b)}`);
		const traced = createTracedListener('messageCreate', 'honeypot', listener);

		expect(traced('x', 'y')).toBe('x-y');
		expect(listener).toHaveBeenCalledWith('x', 'y');
		expect(spans).toEqual([
			{
				name: 'listener messageCreate honeypot',
				attributes: {
					[ListenerAttributes.Event]: 'messageCreate',
					[ListenerAttributes.Name]: 'honeypot',
					[ListenerAttributes.Outcome]: 'success'
				},
				status: null,
				exceptions: [],
				ended: true
			}
		]);
	});

	it('ends the span only when the promise of an async listener settles', async () => {
		let resolve!: (value: string) => void;
		const traced = createTracedListener('guildMemberAdd', 'joinGuard', () => new Promise<string>((r) => (resolve = r)));

		const result = traced();
		expect(spans[0]?.ended).toBe(false);

		resolve('done');
		await expect(result).resolves.toBe('done');
		expect(spans[0]?.ended).toBe(true);
		expect(spans[0]?.attributes[ListenerAttributes.Outcome]).toBe('success');
	});

	it('marks the span as an error and rethrows when the listener throws', () => {
		const error = new Error('boom');
		const traced = createTracedListener('userMessage', 'automod', () => {
			throw error;
		});

		expect(() => traced()).toThrow(error);
		expect(spans[0]).toMatchObject({ status: SpanStatusCode.ERROR, exceptions: [error], ended: true });
		expect(spans[0]?.attributes[ListenerAttributes.Outcome]).toBe('error');
	});

	it('ends the span when reading the then of the result throws', () => {
		const error = new Error('getter');
		const result = {
			// oxlint-disable-next-line unicorn/no-thenable -- a `then` whose getter throws is what this test is about
			get then() {
				throw error;
			}
		};
		const traced = createTracedListener('userMessage', 'automod', () => result);

		expect(() => traced()).toThrow(error);
		expect(spans[0]).toMatchObject({ status: SpanStatusCode.ERROR, exceptions: [error], ended: true });
	});

	it('marks the span as an error and rejects when the listener rejects', async () => {
		const error = new Error('late boom');
		const traced = createTracedListener('userMessage', 'automod', () => Promise.reject(error));

		await expect(traced()).rejects.toBe(error);
		expect(spans[0]).toMatchObject({ status: SpanStatusCode.ERROR, exceptions: [error], ended: true });
	});
});

describe('traceClientListeners', () => {
	it('traces the listeners of the client the store loads, and only those', async () => {
		traceClientListeners();
		const store = container.stores.get('listeners');
		const onClient = vi.fn();
		const onOther = vi.fn();
		const other = { on: vi.fn(), off: vi.fn(), once: vi.fn(), emit: vi.fn(), setMaxListeners: vi.fn(), getMaxListeners: () => 0 };

		const clientPiece = { emitter: container.client, event: 'tracingTest', name: 'traced', _listener: onClient } as unknown as Listener;
		const otherPiece = { emitter: other, event: 'tracingTest', name: 'untraced', _listener: onOther } as unknown as Listener;
		await store.strategy.onLoad(store, clientPiece);
		await store.strategy.onLoad(store, otherPiece);
		const rawPiece = { emitter: container.client, event: 'raw', name: 'rawDebug', _listener: vi.fn() } as unknown as Listener;
		const rawListener: unknown = Reflect.get(rawPiece, '_listener');
		await store.strategy.onLoad(store, rawPiece);
		expect(Reflect.get(rawPiece, '_listener')).toBe(rawListener);
		await store.strategy.onUnload(store, rawPiece);

		container.client.emit('tracingTest', 1);
		expect(onClient).toHaveBeenCalledWith(1);
		expect(spans.map((span) => span.name)).toEqual(['listener tracingTest traced']);
		expect(Reflect.get(otherPiece, '_listener')).toBe(onOther);

		await store.strategy.onUnload(store, clientPiece);
		container.client.emit('tracingTest', 2);
		expect(onClient).toHaveBeenCalledTimes(1);
	});
});
