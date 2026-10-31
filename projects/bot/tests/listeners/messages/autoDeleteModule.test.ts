import { readSettings } from '#lib/database';
import { readAutoDeletes } from '#lib/moderation/cleanup/store';
import { UserListener } from '#root/listeners/messages/messageCreateAutoDelete';
import { container } from '@wolfstar/http-framework';
import type { Message } from '@wolfstar/plugin-gateway';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
vi.mock('#lib/moderation/cleanup/store', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/cleanup/store')>()),
	readAutoDeletes: vi.fn()
}));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const messageId = '254360814063058946';

function mockSettings(settings: Partial<ReadonlyGuildData>) {
	vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guildId, ...settings } as ReadonlyGuildData);
}

// What `/autodelete enable` writes for a channel whose messages are all deleted, at once or after a delay:
function mockAutoDelete(delay: number) {
	vi.mocked(readAutoDeletes).mockResolvedValue([{ id: 'delete', guildId, channelId, delay, allow: [], bots: false }]);
}

const message = {
	id: messageId,
	guildId,
	channelId,
	system: false,
	content: 'Hello',
	webhookId: null,
	author: { id: '266624760782258186', bot: false },
	attachments: [],
	embeds: []
} as unknown as Message;

describe('the auto-delete module (modules.autodelete) in messageCreateAutoDelete', () => {
	// The listener is run on its prototype, which reads the container every piece reads:
	const listener = Object.create(UserListener.prototype) as UserListener;
	const deleteMessage = vi.fn(async () => undefined);
	const createTask = vi.fn(async () => undefined);

	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(container, {
			gatewayClient: { user: { id: '266624760782258190' }, messages: { delete: deleteMessage } },
			tasks: { create: createTask }
		});
	});

	test('GIVEN the module on THEN the message is deleted', async () => {
		mockSettings({ modulesAutodelete: true });
		mockAutoDelete(0);
		await listener.run(message);
		expect(deleteMessage).toHaveBeenCalledWith(channelId, messageId, 'Auto delete');
	});

	test('GIVEN the module on and a delay THEN the deletion is scheduled with the guild', async () => {
		mockSettings({ modulesAutodelete: true });
		mockAutoDelete(30_000);
		await listener.run(message);
		expect(createTask).toHaveBeenCalledWith(
			{ name: 'autoDeleteMessage', payload: { guildId, channelId, messageId } },
			expect.objectContaining({ delay: 30_000 })
		);
	});

	test('GIVEN the module off THEN the message is kept', async () => {
		mockSettings({ modulesAutodelete: false });
		mockAutoDelete(0);
		await listener.run(message);
		expect(deleteMessage).not.toHaveBeenCalled();
		expect(createTask).not.toHaveBeenCalled();
	});

	test('GIVEN a channel with no automatic deletion THEN the settings are not read', async () => {
		vi.mocked(readAutoDeletes).mockResolvedValue([]);
		await listener.run(message);
		expect(readSettings).not.toHaveBeenCalled();
	});
});
