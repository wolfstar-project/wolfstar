import { forwardsDispatches, isWorker } from '#utils/worker';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The events of the gateway itself, which a worker never replays: their listeners stay on the gateway process.
 */
const GatewayOwnEvents = new Set(['clientReady', 'shardReady', 'shardResume', 'shardError', 'shardClose']);

describe('worker', () => {
	const env = { BOT_MODE: process.env.BOT_MODE, BROKER_ENABLED: process.env.BROKER_ENABLED };

	afterEach(() => {
		for (const [key, value] of Object.entries(env)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test.each([
		['gateway', 'false', false, false],
		['gateway', 'true', false, true],
		['worker', 'true', true, false]
	] as const)(
		'GIVEN BOT_MODE=%s and BROKER_ENABLED=%s THEN it is a worker: %s, it forwards the dispatches: %s',
		(mode, broker, worker, forwards) => {
			process.env.BOT_MODE = mode;
			process.env.BROKER_ENABLED = broker;

			expect(isWorker()).toBe(worker);
			expect(forwardsDispatches()).toBe(forwards);
		}
	);

	test('GIVEN the listeners of the gateway THEN only the events of the gateway itself skip RegisterAsDispatchListener', async () => {
		const root = join(import.meta.dirname, '../../../src/listeners');
		const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.ts'));
		const offenders: string[] = [];
		for (const file of files) {
			const content = await readFile(join(root, file), 'utf8');
			for (const [, event] of content.matchAll(/@RegisterAsGatewayListener\('(\w+)'/g)) {
				if (!GatewayOwnEvents.has(event)) offenders.push(`${file}: ${event}`);
			}
		}

		// A listener of an event of Discord would run on the gateway and on the workers, which replay it:
		expect(offenders).toEqual([]);
	});
});
