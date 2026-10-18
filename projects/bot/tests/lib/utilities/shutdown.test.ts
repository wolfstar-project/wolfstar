import { closeLogger } from '#utils/shutdown';
import { container } from '@wolfstar/http-framework';
import { Logger } from '@wolfstar/plugin-logger';

describe('shutdown', () => {
	const original = container.logger;

	afterEach(() => {
		container.logger = original;
	});

	test('GIVEN the logger of the plugin THEN closing it closes its transports', async () => {
		const close = vi.fn();
		container.logger = new Logger({ transports: [{ log: vi.fn(), close }] });

		await closeLogger();

		expect(close).toHaveBeenCalledOnce();
	});

	test('GIVEN a transport that cannot flush THEN closing the logger does not throw', async () => {
		container.logger = new Logger({ transports: [{ log: vi.fn(), close: vi.fn().mockRejectedValue(new Error('offline')) }] });

		await expect(closeLogger()).resolves.toBeUndefined();
	});

	test('GIVEN a logger without close THEN there is nothing to close', async () => {
		container.logger = {
			has: vi.fn(),
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			fatal: vi.fn(),
			write: vi.fn()
		};

		await expect(closeLogger()).resolves.toBeUndefined();
	});
});
