import { readSettings } from '#lib/database';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import type { GuildMessage } from '#lib/types';
import { UserListener } from '#root/listeners/debug/guildUserMessageDebug';
import { container, LogLevel } from '@wolfstar/http-framework';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
vi.mock('#lib/moderation/automod/rules', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/automod/rules')>()),
	readAutoModerationRules: vi.fn()
}));

describe('the debug log of the auto-moderation (guildUserMessageDebug)', () => {
	// The listener is run on its prototype, which reads the container every piece reads:
	const listener = Object.create(UserListener.prototype) as UserListener;
	const debug = vi.fn();
	const message = { id: '1', channelId: '3', guildId: '2', author: { id: '4' } } as unknown as GuildMessage;

	beforeEach(() => vi.clearAllMocks());

	test('GIVEN the debug level THEN the module and the enabled rules are told once', async () => {
		Object.assign(container, { logger: { has: (level: LogLevel) => level >= LogLevel.Debug, debug } });
		vi.mocked(readSettings).mockResolvedValue({ modulesAutomod: false } as never);
		vi.mocked(readAutoModerationRules).mockResolvedValue([{ enabled: true }, { enabled: false }] as never);

		await listener.run(message);

		expect(debug).toHaveBeenCalledTimes(1);
		expect(debug).toHaveBeenCalledWith('[AutoMod] message 1 of 4 in 3 of 2: the module is off, 1 rules enabled');
	});

	test('GIVEN another level THEN nothing is read for it', async () => {
		Object.assign(container, { logger: { has: (level: LogLevel) => level >= LogLevel.Info, debug } });

		await listener.run(message);

		expect(readSettings).not.toHaveBeenCalled();
		expect(debug).not.toHaveBeenCalled();
	});
});
