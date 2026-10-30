import { readSettings } from '#lib/database';
import { catchHoneypotMessage } from '#lib/moderation/honeypot/catch';
import { UserListener } from '#root/listeners/messages/messageCreateHoneypot';
import type { Message } from '@wolfstar/plugin-gateway';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
vi.mock('#lib/moderation/honeypot/catch', () => ({ catchHoneypotMessage: vi.fn(async () => undefined) }));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const otherChannelId = '254360814063058947';

function mockSettings(settings: Partial<ReadonlyGuildData>) {
	const data = { ...getDefaultGuildSettings()!, id: guildId, honeypotChannel: channelId, ...settings } as ReadonlyGuildData;
	vi.mocked(readSettings).mockResolvedValue(data);
	return data;
}

// What a spam bot sends in the honeypot channel:
function createMessage(overrides: { channelId?: string } = {}) {
	return {
		id: '254360814063058946',
		guildId,
		channelId,
		system: false,
		content: 'Free nitro',
		webhookId: null,
		author: { id: '266624760782258186', bot: false },
		...overrides
	} as unknown as Message;
}

describe('the honeypot module (modules.honeypot) in messageCreateHoneypot', () => {
	// The listener is run on its prototype, which reads the container every piece reads:
	const listener = Object.create(UserListener.prototype) as UserListener;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('GIVEN the module on THEN who writes in the channel is caught', async () => {
		const settings = mockSettings({ modulesHoneypot: true });
		const message = createMessage();

		await listener.run(message);

		expect(catchHoneypotMessage).toHaveBeenCalledWith(message, settings);
	});

	test('GIVEN the module off THEN nobody is caught', async () => {
		mockSettings({ modulesHoneypot: false });

		await listener.run(createMessage());

		expect(catchHoneypotMessage).not.toHaveBeenCalled();
	});

	test('GIVEN the module on and a message of another channel THEN nobody is caught', async () => {
		mockSettings({ modulesHoneypot: true });

		await listener.run(createMessage({ channelId: otherChannelId }));

		expect(catchHoneypotMessage).not.toHaveBeenCalled();
	});
});
