import { formatStartupStatus } from '#utils/startup';

describe('formatStartupStatus', () => {
	const redis = { host: 'redis.railway.internal', port: 6379 };

	test('GIVEN a gateway that forwards the dispatches THEN it shows the stream, the HTTP server and the API', () => {
		const lines = formatStartupStatus({
			analytics: true,
			redis,
			role: {
				mode: 'gateway',
				shards: 2,
				http: { address: '0.0.0.0', port: 3000 },
				api: { host: '0.0.0.0', port: 8282 },
				brokerStream: 'wolfstar:events'
			}
		});

		expect(lines).toEqual([
			'├─ [+] Mode      : gateway, 2 shards',
			'├─ [+] Broker    : forwarding to wolfstar:events',
			'├─ [+] Analytics',
			'├─ [+] HTTP      : 0.0.0.0:3000',
			'├─ [+] API       : 0.0.0.0:8282',
			'└─ [+] Redis     : redis.railway.internal:6379'
		]);
	});

	test('GIVEN a gateway with no broker and no API THEN both are off', () => {
		const lines = formatStartupStatus({
			analytics: false,
			redis,
			role: { mode: 'gateway', shards: 'auto', http: { address: '127.0.0.1', port: 3000 }, api: null, brokerStream: null }
		});

		expect(lines).toContain('├─ [-] Broker    : off');
		expect(lines).toContain('├─ [-] API       : off');
		expect(lines).toContain('├─ [-] Analytics');
	});

	test('GIVEN a worker THEN it shows the stream it reads and its name, and no HTTP server nor API', () => {
		const lines = formatStartupStatus({
			analytics: false,
			redis,
			role: { mode: 'worker', broker: { stream: 'wolfstar:events', group: 'workers', consumer: 'worker-1' } }
		});

		expect(lines).toEqual([
			'├─ [+] Mode      : worker, replaying the dispatches of the gateway',
			'├─ [+] Broker    : wolfstar:events, group workers, consumer worker-1',
			'├─ [-] Analytics',
			'└─ [+] Redis     : redis.railway.internal:6379'
		]);
	});
});
