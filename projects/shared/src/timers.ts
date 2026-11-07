/**
 * The longest delay `setTimeout` accepts, it fires immediately for a longer one.
 */
const MaximumTimeoutDelay = 2 ** 31 - 1;

export function setAccurateTimeout<T extends readonly any[]>(fn: (...args: T) => void, delay: number, ...args: T) {
	const end = Date.now() + delay;
	const context: AccurateTimeout<T> = {
		timeout: null!,
		fn,
		cb(...args: T) {
			const remaining = end - Date.now();
			if (remaining < 1) {
				fn(...args);
			} else {
				// eslint-disable-next-line @typescript-eslint/unbound-method
				context.timeout = setTimeout(context.cb, Math.min(remaining, MaximumTimeoutDelay), ...args).unref();
			}
		},
		stop() {
			clearAccurateTimeout(context);
		}
	};

	// eslint-disable-next-line @typescript-eslint/unbound-method
	context.timeout = setTimeout(context.cb, Math.min(delay, MaximumTimeoutDelay), ...args).unref();
	return context;
}

export function clearAccurateTimeout<T extends readonly any[]>(context: AccurateTimeout<T>) {
	clearTimeout(context.timeout);
}

export interface AccurateTimeout<T extends readonly any[] = readonly any[]> {
	timeout: NodeJS.Timeout;
	fn(...args: T): void;
	cb(...args: T): void;
	stop(): void;
}
