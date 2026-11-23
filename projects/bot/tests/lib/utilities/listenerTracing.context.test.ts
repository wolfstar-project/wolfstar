import { createTracedListener } from '#utils/listenerTracing';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { setTimeout as sleep } from 'node:timers/promises';

// The SDK with the context manager the preload of `@wolfstar/plugin-opentelemetry` starts, so the span of a listener is
// the active one across its awaits, as it is in production:
const exporter = new InMemorySpanExporter();
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
	context.setGlobalContextManager(contextManager.enable());
	trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }));
});

afterAll(() => {
	trace.disable();
	context.disable();
});

beforeEach(() => {
	exporter.reset();
});

describe('createTracedListener with the OpenTelemetry SDK', () => {
	it('keeps the span of the listener active after an await, so what it runs is its child', async () => {
		const traced = createTracedListener('guildMemberAdd', 'joinGuard', async () => {
			await sleep(1);
			trace.getTracer('test').startSpan('pg.query').end();
		});

		await traced();

		const [child, parent] = exporter.getFinishedSpans();
		expect(parent?.name).toBe('listener guildMemberAdd joinGuard');
		expect(child?.name).toBe('pg.query');
		expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
		expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
	});

	it('makes the span of a listener the parent of the listeners of the events it emits', async () => {
		const inner = createTracedListener('userMessage', 'automod', async () => {
			await sleep(1);
		});
		const outer = createTracedListener('messageCreate', 'messageCreate', async () => {
			await sleep(1);
			await inner();
		});

		await outer();

		const spans = exporter.getFinishedSpans();
		const innerSpan = spans.find((span) => span.name === 'listener userMessage automod');
		const outerSpan = spans.find((span) => span.name === 'listener messageCreate messageCreate');
		expect(outerSpan?.parentSpanContext).toBeUndefined();
		expect(innerSpan?.parentSpanContext?.spanId).toBe(outerSpan?.spanContext().spanId);
	});
});
