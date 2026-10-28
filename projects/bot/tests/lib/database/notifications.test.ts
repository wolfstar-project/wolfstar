import { DatabaseNotificationChannels, DatabaseNotificationListener, type NotificationClient } from '#lib/database/notifications';
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

const Listens = [`LISTEN ${DatabaseNotificationChannels.GuildSettingsUpdate}`, `LISTEN ${DatabaseNotificationChannels.JoinGuardRequest}`];

describe('DatabaseNotificationListener', () => {
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

	function create() {
		const settings = vi.fn();
		const requests = vi.fn();
		const onListen = vi.fn();
		const listener = new DatabaseNotificationListener({
			createClient: () => {
				const client = new FakeClient(failures-- > 0);
				clients.push(client);
				return client;
			},
			channels: { [DatabaseNotificationChannels.GuildSettingsUpdate]: settings, [DatabaseNotificationChannels.JoinGuardRequest]: requests },
			onListen,
			logger,
			initialBackoff: 1000,
			maximumBackoff: 4000
		});
		return { listener, settings, requests, onListen };
	}

	test('GIVEN a notification THEN the handler of its channel gets the payload', async () => {
		const { listener, settings, requests, onListen } = create();
		listener.start();
		await vi.advanceTimersByTimeAsync(0);

		expect(clients[0].queries).toEqual(Listens);
		expect(onListen).toHaveBeenCalledTimes(1);
		clients[0].emit('notification', { channel: DatabaseNotificationChannels.JoinGuardRequest, payload: '12' });
		clients[0].emit('notification', { channel: 'other', payload: '13' });

		expect(requests).toHaveBeenCalledWith('12');
		expect(settings).not.toHaveBeenCalled();
		await listener.stop();
	});

	test('GIVEN a handler that throws THEN it is logged and the connection keeps listening', async () => {
		const { listener, settings } = create();
		settings.mockImplementation(() => {
			throw new Error('boom');
		});
		listener.start();
		await vi.advanceTimersByTimeAsync(0);

		clients[0].emit('notification', { channel: DatabaseNotificationChannels.GuildSettingsUpdate, payload: '{}' });

		expect(logger.error).toHaveBeenCalled();
		expect(clients).toHaveLength(1);
		await listener.stop();
	});

	test('GIVEN a connection that fails THEN it connects again, waiting longer each time up to the most', async () => {
		failures = 3;
		const { listener, onListen } = create();
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
		expect(clients[3].queries).toEqual(Listens);
		expect(onListen).toHaveBeenCalledTimes(1);
		await listener.stop();
	});

	test('GIVEN a connection lost after it listened THEN a new one listens, and what was missed is caught up', async () => {
		const { listener, onListen } = create();
		listener.start();
		await vi.advanceTimersByTimeAsync(0);

		clients[0].emit('error', new Error('terminated'));
		await vi.advanceTimersByTimeAsync(1000);

		expect(clients).toHaveLength(2);
		expect(clients[1].queries).toEqual(Listens);
		expect(onListen).toHaveBeenCalledTimes(2);
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
