import { JoinGuardRequestChannel, JoinGuardRequestListener, type NotificationClient } from '#lib/moderation/joinguard/listener';
import { EventEmitter } from 'node:events';

class FakeClient extends EventEmitter implements NotificationClient {
	public readonly queries: string[] = [];
	public constructor(private readonly fails: boolean) {
		super();
	}

	public async connect() {
		if (this.fails) throw new Error('ECONNREFUSED');
	}

	public async query(text: string) {
		this.queries.push(text);
	}

	public async end() {}
}

describe('JoinGuardRequestListener', () => {
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	let clients: FakeClient[];
	let failures: number;

	beforeEach(() => {
		vi.useFakeTimers();
		clients = [];
		failures = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function create(handle = vi.fn(async () => undefined), sweep = vi.fn(async (): Promise<string[]> => [])) {
		const listener = new JoinGuardRequestListener({
			createClient: () => {
				const client = new FakeClient(failures-- > 0);
				clients.push(client);
				return client;
			},
			handle,
			sweep,
			logger,
			sweepInterval: 30_000,
			initialBackoff: 1000,
			maximumBackoff: 4000
		});
		return { listener, handle, sweep };
	}

	test('GIVEN a notification THEN its request is handled', async () => {
		const { listener, handle } = create();
		listener.start();
		await vi.advanceTimersByTimeAsync(0);

		expect(clients[0].queries).toEqual([`LISTEN ${JoinGuardRequestChannel}`]);
		clients[0].emit('notification', { channel: JoinGuardRequestChannel, payload: '12' });
		clients[0].emit('notification', { channel: 'other', payload: '13' });
		await vi.advanceTimersByTimeAsync(0);

		expect(handle).toHaveBeenCalledWith('12');
		expect(handle).toHaveBeenCalledTimes(1);
		await listener.stop();
	});

	test('GIVEN a request notified and swept at once THEN it is queued once', async () => {
		const { listener, handle } = create();
		await Promise.all([listener.enqueue('7'), listener.enqueue('7')]);

		expect(handle).toHaveBeenCalledTimes(1);
	});

	test('GIVEN the start and the interval THEN the requests nobody claimed are swept', async () => {
		const { listener, handle, sweep } = create(
			undefined,
			vi.fn(async () => ['1', '2'])
		);
		listener.start();
		await vi.advanceTimersByTimeAsync(0);
		const atStart = sweep.mock.calls.length;

		await vi.advanceTimersByTimeAsync(30_000);

		expect(atStart).toBeGreaterThanOrEqual(1);
		expect(sweep.mock.calls.length).toBe(atStart + 1);
		expect(handle).toHaveBeenCalledWith('1');
		expect(handle).toHaveBeenCalledWith('2');
		await listener.stop();
	});

	test('GIVEN a connection that fails THEN it connects again, waiting longer each time up to the most', async () => {
		failures = 3;
		const { listener } = create();
		listener.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(clients).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(1000);
		expect(clients).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1999);
		expect(clients).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(clients).toHaveLength(3);
		await vi.advanceTimersByTimeAsync(4000);
		expect(clients).toHaveLength(4);
		expect(clients[3].queries).toEqual([`LISTEN ${JoinGuardRequestChannel}`]);
		await listener.stop();
	});

	test('GIVEN a connection lost after it listened THEN a new one listens', async () => {
		const { listener } = create();
		listener.start();
		await vi.advanceTimersByTimeAsync(0);

		clients[0].emit('error', new Error('terminated'));
		await vi.advanceTimersByTimeAsync(1000);

		expect(clients).toHaveLength(2);
		expect(clients[1].queries).toEqual([`LISTEN ${JoinGuardRequestChannel}`]);
		await listener.stop();
	});

	test('GIVEN a stopped listener THEN it does not connect again', async () => {
		const { listener } = create();
		listener.start();
		await vi.advanceTimersByTimeAsync(0);
		await listener.stop();

		clients[0].emit('end');
		await vi.advanceTimersByTimeAsync(60_000);

		expect(clients).toHaveLength(1);
	});
});
