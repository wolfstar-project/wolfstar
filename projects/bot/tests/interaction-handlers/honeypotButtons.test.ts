import { readSettings } from '#lib/database';
import { readHoneypotStats } from '#lib/moderation/honeypot/stats';
import { UserInteractionHandler as IntroHandler } from '#root/interaction-handlers/honeypotIntro';
import { UserInteractionHandler as StatsHandler } from '#root/interaction-handlers/honeypotStats';
import { container } from '@wolfstar/http-framework';
import { MessageFlags } from 'discord-api-types/v10';

vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));
vi.mock('#lib/moderation/honeypot/stats', () => ({ readHoneypotStats: vi.fn(), RecentCatchesDays: 7 }));
vi.mock('@wolfstar/plugin-i18next', () => ({
	getSupportedUserLanguageT: () => (key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options ?? {})}`
}));

const guildId = '254360814063058944';

describe('the buttons of the honeypot', () => {
	const reply = vi.fn(async () => undefined);
	const deferUpdate = vi.fn(async () => 'deferred');
	const defer = vi.fn(async () => ({ update: reply }));
	const deleteMessage = vi.fn(async () => undefined);

	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(container, { gatewayClient: { messages: { delete: deleteMessage } } });
	});

	test('GIVEN the Catches button THEN it answers who clicked with the numbers of the honeypot, ephemerally', async () => {
		vi.mocked(readHoneypotStats).mockResolvedValue({ total: 12, recent: 3 });
		vi.mocked(readSettings).mockResolvedValue({ honeypotAction: 'Softban', honeypotChannel: '254360814063058945' } as never);
		const handler = Object.create(StatsHandler.prototype) as StatsHandler;

		await handler.run({ reply, defer, guildId } as never, [guildId, 'show']);

		expect(defer).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
		expect(reply).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining('"total":12,"recent":3,"days":7')
			})
		);
	});

	test('GIVEN the Catches button of another guild, or a bad ID THEN it says it expired', async () => {
		const handler = Object.create(StatsHandler.prototype) as StatsHandler;

		await handler.run({ reply, guildId } as never, ['254360814063058999', 'show']);
		await handler.run({ reply, guildId } as never, [guildId, 'other']);

		expect(reply).toHaveBeenCalledTimes(2);
		expect(readHoneypotStats).not.toHaveBeenCalled();
	});

	test('GIVEN the Delete now button THEN the intro is deleted, and nothing else is answered', async () => {
		const handler = Object.create(IntroHandler.prototype) as IntroHandler;

		await handler.run({ reply, deferUpdate, guildId, channelId: '254360814063058945', message: { id: '254360814063058950' } } as never, [
			guildId,
			'dismiss'
		]);

		expect(deferUpdate).toHaveBeenCalledOnce();
		expect(deleteMessage).toHaveBeenCalledWith('254360814063058945', '254360814063058950', 'Honeypot');
		expect(reply).not.toHaveBeenCalled();
	});
});
