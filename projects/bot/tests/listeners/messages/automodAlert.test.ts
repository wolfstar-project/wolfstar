import { UserModerationMessageListener } from '#root/listeners/moderation/messages/guildUserMessageWordsHandler';
import { container } from '@wolfstar/http-framework';
import type { Message } from '@wolfstar/plugin-gateway';

const guildId = '254360814063058944';
const channelId = '254360814063058945';

function createMessage(authorId: string) {
	const send = vi.fn(async () => ({ id: '254360814063058950' }));
	const channel = { id: channelId, type: 0, send };
	const message = {
		guildId,
		channelId,
		id: '254360814063058946',
		author: { id: authorId, toString: () => `<@${authorId}>` },
		fetchChannel: async () => channel
	} as unknown as Message;
	return { message, send };
}

describe('the alert of an auto-moderation rule', () => {
	// The listener is run on its prototype, which reads the container every piece reads:
	const listener = Object.create(UserModerationMessageListener.prototype) as UserModerationMessageListener & {
		sendAlert(message: Message, t: unknown, key: string): Promise<unknown>;
	};
	const t = (key: string, options: { user: string }) => `${key} ${options.user}`;
	const store = new Map<string, string>();
	const original = container.redis;
	// The process remembers its claims for a minute, so each test starts after the ones of the test before it ended:
	let now = Date.UTC(2026, 0, 1);

	beforeEach(() => {
		store.clear();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime((now += 61_000));
		container.redis = {
			status: 'ready',
			set: async (key: string, value: string) => {
				if (store.has(key)) return null;
				store.set(key, value);
				return 'OK';
			},
			del: async (key: string) => (store.delete(key) ? 1 : 0)
		} as never;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	afterAll(() => {
		container.redis = original;
	});

	test('GIVEN a member who keeps infringing the rule THEN they are told once, and not by every message', async () => {
		const first = createMessage('266624760782258186');
		const second = createMessage('266624760782258186');
		const third = createMessage('266624760782258186');

		await listener.sendAlert(first.message, t, 'events/moderation:wordFilter');
		await listener.sendAlert(second.message, t, 'events/moderation:wordFilter');
		await listener.sendAlert(third.message, t, 'events/moderation:wordFilter');

		expect(first.send).toHaveBeenCalledOnce();
		expect(second.send).not.toHaveBeenCalled();
		expect(third.send).not.toHaveBeenCalled();
	});

	test('GIVEN an alert that could not be sent THEN the next message is told', async () => {
		const failed = createMessage('266624760782258188');
		failed.send.mockRejectedValueOnce(new Error('Missing Permissions'));
		const next = createMessage('266624760782258188');

		await expect(listener.sendAlert(failed.message, t, 'events/moderation:wordFilter')).rejects.toThrow('Missing Permissions');
		await listener.sendAlert(next.message, t, 'events/moderation:wordFilter');

		expect(next.send).toHaveBeenCalledOnce();
	});

	test('GIVEN another member, or another alert, THEN they are told as well', async () => {
		const member = createMessage('266624760782258186');
		const other = createMessage('266624760782258187');
		const another = createMessage('266624760782258186');

		await listener.sendAlert(member.message, t, 'events/moderation:wordFilter');
		await listener.sendAlert(other.message, t, 'events/moderation:wordFilter');
		await listener.sendAlert(another.message, t, 'events/moderation:capsFilter');

		expect(member.send).toHaveBeenCalledOnce();
		expect(other.send).toHaveBeenCalledOnce();
		expect(another.send).toHaveBeenCalledOnce();
	});
});
