import { UserListener } from '#root/listeners/debug/rawDebug';
import { container, LogLevel } from '@wolfstar/http-framework';

describe('the debug log of the dispatches (rawDebug)', () => {
	// The listener is run on its prototype, which reads the container every piece reads:
	const listener = Object.create(UserListener.prototype) as UserListener;
	const debug = vi.fn();
	const payload = { t: 'MESSAGE_CREATE', d: { id: '1', channel_id: '3' } } as never;

	beforeEach(() => vi.clearAllMocks());

	test('GIVEN the debug level THEN every dispatch is told with its shard', () => {
		Object.assign(container, { logger: { has: (level: LogLevel) => level >= LogLevel.Debug, debug } });

		listener.run(payload, 2);

		expect(debug).toHaveBeenCalledWith('[Gateway] Shard 2: MESSAGE_CREATE id=1 channel=3');
	});

	test('GIVEN another level THEN a dispatch costs nothing', () => {
		Object.assign(container, { logger: { has: (level: LogLevel) => level >= LogLevel.Info, debug } });

		listener.run(payload, 2);

		expect(debug).not.toHaveBeenCalled();
	});
});
