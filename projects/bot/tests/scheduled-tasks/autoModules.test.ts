import { runAutoMessage } from '#lib/automessages/send';
import { readSettings } from '#lib/database';
import { runAutoPurge } from '#lib/moderation/cleanup/purge';
import { UserTask as AutoDeleteMessageTask } from '#root/scheduled-tasks/autoDeleteMessage';
import { UserTask as AutoMessageTask } from '#root/scheduled-tasks/autoMessage';
import { UserTask as AutoPurgeTask } from '#root/scheduled-tasks/autoPurge';
import { container } from '@wolfstar/http-framework';
import {
	fetchAutoMessage,
	fetchDueAutoMessages,
	fetchDueAutoPurges,
	getDefaultGuildSettings,
	setAutoMessageNextRun,
	setAutoPurgeNextRun,
	type AutoMessage,
	type ReadonlyGuildData
} from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
vi.mock('#lib/moderation/cleanup/purge', () => ({ runAutoPurge: vi.fn(async () => 'purged') }));
vi.mock('#lib/automessages/send', () => ({ runAutoMessage: vi.fn(async () => 'sent') }));
vi.mock('#lib/automessages/store', () => ({ withAutoMessageLock: (_guildId: string, callback: () => unknown) => callback() }));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchDueAutoPurges: vi.fn(),
	setAutoPurgeNextRun: vi.fn(),
	deleteAutoPurge: vi.fn(),
	fetchDueAutoMessages: vi.fn(),
	fetchAutoMessage: vi.fn(),
	setAutoMessageNextRun: vi.fn(),
	deleteAutoMessage: vi.fn()
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const messageId = '254360814063058946';

function mockSettings(settings: Partial<ReadonlyGuildData>) {
	vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guildId, ...settings } as ReadonlyGuildData);
}

// The tasks are run on their prototype, which reads the container every piece reads:
function create<Task extends object>(Task_: abstract new (...args: never[]) => Task): Task {
	return Object.create(Task_.prototype) as Task;
}

describe('the modules of the automatic channels in their tasks', () => {
	const getMessage = vi.fn(async () => ({ id: messageId, pinned: false }));
	const deleteMessage = vi.fn(async () => undefined);

	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(container, {
			gatewayClient: { isClientReady: () => true, api: { channels: { getMessage } }, messages: { delete: deleteMessage } },
			logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
			// The queries are mocked, they are only given it:
			prisma: { orm: {} }
		});
	});

	describe('autoDeleteMessage (modules.autodelete)', () => {
		const task = create(AutoDeleteMessageTask);

		test('GIVEN the module on THEN the message is deleted', async () => {
			mockSettings({ modulesAutodelete: true });
			await task.run({ guildId, channelId, messageId });
			expect(deleteMessage).toHaveBeenCalledWith(channelId, messageId, 'Auto delete');
		});

		test('GIVEN the module turned off after the message was sent THEN the message is kept', async () => {
			mockSettings({ modulesAutodelete: false });
			await task.run({ guildId, channelId, messageId });
			expect(getMessage).not.toHaveBeenCalled();
			expect(deleteMessage).not.toHaveBeenCalled();
		});

		test('GIVEN a job of a version that did not know the guild THEN the message is deleted', async () => {
			await task.run({ channelId, messageId });
			expect(readSettings).not.toHaveBeenCalled();
			expect(deleteMessage).toHaveBeenCalled();
		});
	});

	describe('autoPurge (modules.autopurge)', () => {
		const task = create(AutoPurgeTask);
		const purge = { id: 'purge', guildId, channelId, interval: 60_000 };

		beforeEach(() => {
			vi.mocked(fetchDueAutoPurges).mockResolvedValue([purge] as never);
		});

		test('GIVEN the module on THEN the channel is purged', async () => {
			mockSettings({ modulesAutopurge: true });
			await task.run();
			expect(runAutoPurge).toHaveBeenCalledWith(purge);
		});

		test('GIVEN the module off THEN the channel is not purged, and is due again at its next time', async () => {
			mockSettings({ modulesAutopurge: false });
			await task.run();
			expect(setAutoPurgeNextRun).toHaveBeenCalledWith(container.prisma, purge.id, expect.any(Number));
			expect(runAutoPurge).not.toHaveBeenCalled();
		});
	});

	describe('autoMessage (modules.automessage)', () => {
		const task = create(AutoMessageTask);
		const message = { id: 'message', guildId, channelId, interval: 600_000, nextRunAt: 0 } as unknown as AutoMessage;

		beforeEach(() => {
			vi.mocked(fetchDueAutoMessages).mockResolvedValue([message]);
			vi.mocked(fetchAutoMessage).mockResolvedValue(message);
		});

		test('GIVEN the module on THEN the message is sent', async () => {
			mockSettings({ modulesAutomessage: true });
			await task.run();
			expect(runAutoMessage).toHaveBeenCalledWith(message);
		});

		test('GIVEN the module off THEN the message is not sent, and is due again at its next time', async () => {
			mockSettings({ modulesAutomessage: false });
			await task.run();
			expect(setAutoMessageNextRun).toHaveBeenCalledWith(container.prisma, message.id, expect.any(Number));
			expect(runAutoMessage).not.toHaveBeenCalled();
		});
	});
});
