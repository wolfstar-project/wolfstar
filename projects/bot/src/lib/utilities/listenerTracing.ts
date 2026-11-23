import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
// Renamed: the auto-imports of the build would add a value import of `Listener` next to a type-only one.
import { container, type Listener as ListenerPiece } from '@wolfstar/http-framework';

/**
 * The name of the tracer of the spans of the listeners.
 */
const TracerName = 'wolfstar-listeners';

/**
 * The attributes of the span of a listener.
 */
export const ListenerAttributes = {
	/**
	 * The event the listener runs on, such as `messageCreate` or `userMessage`.
	 */
	Event: 'wolfstar.listener.event',
	/**
	 * The name of the listener's piece.
	 */
	Name: 'wolfstar.listener.name',
	/**
	 * `success` or `error`, set when the run ends.
	 */
	Outcome: 'wolfstar.listener.outcome'
} as const;

/**
 * What the listener store calls a piece with, set by `Listener`'s constructor and wrapped by the decorators of
 * `@wolfstar/plugin-gateway`.
 */
type ListenerFunction = (...args: readonly unknown[]) => unknown;

/**
 * The events every dispatch of Discord is emitted with, before the one of its type: a span for each of their listeners
 * would add a trace to every dispatch the gateway receives, almost all of them for a listener that returns at once.
 */
const UntracedEvents: ReadonlySet<string> = new Set(['raw', 'dispatch']);

/**
 * The pieces whose function was already wrapped, so a piece loaded again is not traced twice.
 */
const traced = new WeakSet<ListenerPiece>();

/**
 * Opens a span for every run of the listeners of the client: the events of Discord (`messageCreate`,
 * `guildMemberAdd`…) and the ones the bot emits itself (`userMessage`…), which until now had none, so the queries and
 * the requests they make were spans with no parent and their own duration was not measured.
 *
 * @remarks
 *
 * The span is the active one while the listener runs, so an event a listener emits on the client gets a child span,
 * and so do the `pg`, `ioredis` and `undici` spans of what it awaits. A listener of a command's event, such as
 * `commandSuccess`, runs inside the span of the command. Without the OpenTelemetry SDK (no OTLP endpoint) the spans are
 * no-ops.
 *
 * Each run is a trace of its own: a dispatch has no span, so the listeners of one `messageCreate` are not under a
 * common parent. The listeners of `raw` and `dispatch` are left out ({@linkcode UntracedEvents}).
 *
 * It wraps the store's loading strategy, so it has to run before the pieces are loaded.
 */
export function traceClientListeners(): void {
	const { strategy } = container.stores.get('listeners');
	const onLoad = strategy.onLoad.bind(strategy);

	strategy.onLoad = (store, piece) => {
		if (piece.emitter === container.client && !UntracedEvents.has(piece.event)) wrapListener(piece);
		return onLoad(store, piece);
	};
}

/**
 * Replaces the function the store adds to the emitter of a listener with one that runs it in a span.
 *
 * @param piece - The listener.
 */
export function wrapListener(piece: ListenerPiece): void {
	if (traced.has(piece)) return;

	const listener: unknown = Reflect.get(piece, '_listener');
	if (typeof listener !== 'function') return;

	traced.add(piece);
	Reflect.set(piece, '_listener', createTracedListener(piece.event, piece.name, listener as ListenerFunction));
}

/**
 * Wraps a listener's function, so each run opens a span named `listener <event> <name>` that ends when the run does,
 * the promise it returns included.
 *
 * @param event - The event the listener runs on.
 * @param name - The name of the listener's piece.
 * @param listener - The function to wrap.
 */
export function createTracedListener(event: string, name: string, listener: ListenerFunction): ListenerFunction {
	const tracer = trace.getTracer(TracerName);
	const attributes = { [ListenerAttributes.Event]: event, [ListenerAttributes.Name]: name };

	return (...args) =>
		tracer.startActiveSpan(`listener ${event} ${name}`, { attributes }, (span) => {
			let result: unknown;
			let pending: boolean;
			try {
				result = listener(...args);
				// Inside the `try`: reading `then` can run a getter that throws.
				pending = isPromiseLike(result);
			} catch (error) {
				endWithError(span, error);
				throw error;
			}

			if (!pending) {
				endWithSuccess(span);
				return result;
			}

			return Promise.resolve(result as PromiseLike<unknown>).then(
				(value) => {
					endWithSuccess(span);
					return value;
				},
				(error: unknown) => {
					endWithError(span, error);
					throw error;
				}
			);
		});
}

function endWithSuccess(span: Span) {
	span.setAttribute(ListenerAttributes.Outcome, 'success');
	span.end();
}

function endWithError(span: Span, error: unknown) {
	span.setAttribute(ListenerAttributes.Outcome, 'error');
	if (error instanceof Error) span.recordException(error);
	span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
	span.end();
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'then') === 'function';
}
