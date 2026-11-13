import { getSentryIntegrations } from '#utils/sentry';
import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import type { Context, ContextManager } from '@opentelemetry/api';
import { Sentry } from '@wolfstar/shared-http-pieces';

// The context manager of the SDK (async hooks) is not started in the tests: this one keeps the active context in a
// stack, which is enough for the callback below, that runs at once.
class StackContextManager implements ContextManager {
	#stack: Context[] = [];

	public active() {
		return this.#stack.at(-1) ?? ROOT_CONTEXT;
	}

	public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
		active: Context,
		fn: F,
		thisArg?: ThisParameterType<F>,
		...args: A
	): ReturnType<F> {
		this.#stack.push(active);
		try {
			return fn.call(thisArg, ...args);
		} finally {
			this.#stack.pop();
		}
	}

	public bind<T>(_context: Context, target: T): T {
		return target;
	}

	public enable() {
		return this;
	}

	public disable() {
		this.#stack = [];
		return this;
	}
}

const traceId = '0af7651916cd43dd8448eb211c80319c';
const spanId = 'b7ad6b7169203331';

describe('getSentryIntegrations', () => {
	const events: Sentry.ErrorEvent[] = [];

	beforeAll(() => {
		context.setGlobalContextManager(new StackContextManager());
		// Nothing is sent: `beforeSend` drops the events, and none of the default integrations is set up.
		Sentry.init({
			dsn: 'https://public@o0.ingest.sentry.io/1',
			defaultIntegrations: false,
			integrations: getSentryIntegrations(),
			sendClientReports: false,
			beforeSend: (event) => {
				events.push(event);
				return null;
			}
		});
	});

	afterAll(async () => {
		await Sentry.close();
		context.disable();
	});

	beforeEach(() => {
		events.length = 0;
	});

	test('GIVEN an error captured while an OpenTelemetry span is active THEN the event is on the trace and the span of it', () => {
		const span = trace.wrapSpanContext({ traceId, spanId, traceFlags: TraceFlags.SAMPLED });

		context.with(trace.setSpan(context.active(), span), () => Sentry.captureException(new Error('boom')));

		expect(events).toHaveLength(1);
		expect(events[0].contexts?.trace).toMatchObject({ trace_id: traceId, span_id: spanId });
	});

	test('GIVEN an error captured with no OpenTelemetry span active THEN the event keeps the trace of Sentry', () => {
		Sentry.captureException(new Error('boom'));

		expect(events).toHaveLength(1);
		expect(events[0].contexts?.trace?.trace_id).toMatch(/^[0-9a-f]{32}$/);
		expect(events[0].contexts?.trace?.trace_id).not.toBe(traceId);
	});

	test('GIVEN the integrations THEN only the one that connects Sentry to OpenTelemetry is set up, which exports no span', () => {
		expect(getSentryIntegrations().map((integration) => integration.name)).toEqual(['OpenTelemetry']);
	});
});
