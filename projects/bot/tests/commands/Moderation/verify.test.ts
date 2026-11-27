import { admitJoinGuardMember } from '#lib/moderation/joinguard/checkpoint';
import { UserCommand } from '#root/commands/Moderation/verify';
import { Emojis } from '#utils/emojis';
import { Colors } from '#utils/constants';
import locale from '../../../src/locales/en-US/commands/join-guard.json';
import { createInstance } from 'i18next';
import { messageText } from '../../mocks/status';

vi.mock('#lib/moderation/joinguard/checkpoint', () => ({ admitJoinGuardMember: vi.fn() }));
vi.mock('@wolfstar/plugin-i18next', async (original) => ({
	...(await original<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: () => i18n.t.bind(i18n)
}));

const i18n = createInstance();

test('a successful verification shows one success icon and the admitted member', async () => {
	await i18n.init({
		lng: 'en-US',
		resources: { 'en-US': { 'commands/join-guard': locale } },
		interpolation: { escapeValue: false, defaultVariables: { GREENTICK: Emojis.GreenTick } }
	});
	vi.mocked(admitJoinGuardMember).mockResolvedValue({ ok: true, value: { checkpoint: null, changedRoles: true } } as never);
	const update = vi.fn();
	const interaction = { guildId: '254360814063058944', user: { id: '266624760782258186' }, defer: async () => ({ update }) };

	await UserCommand.prototype.chatInputRun.call({} as never, interaction as never, { user: { user: { id: '266624760782258187' } } } as never);

	const reply = update.mock.calls[0][0];
	expect(messageText(reply)).toBe(`${Emojis.GreenTick} <@266624760782258187> is let in.`);
	expect(reply.components[0].accent_color).toBe(Colors.Green);
});
