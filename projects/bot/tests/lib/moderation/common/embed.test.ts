import { getEmbed } from '#lib/moderation/common/util';
import { container } from '@wolfstar/http-framework';

// The author of the embed needs the CDN of a real client, which is not what this test is about:
vi.mock('#utils/util', async (importOriginal) => ({
	...(await importOriginal<typeof import('#utils/util')>()),
	getFullEmbedAuthor: vi.fn(() => ({ name: 'bot (266624760782258186)' }))
}));

const botId = '266624760782258186';
const avatar = 'https://cdn.discordapp.com/avatars/bot.png';

describe('getEmbed', () => {
	const gatewayClient = container.gatewayClient;
	afterEach(() => {
		container.gatewayClient = gatewayClient;
		vi.unstubAllEnvs();
	});

	test('GIVEN a worker, whose client has no user THEN the footer icon is the avatar of the application', async () => {
		// A worker never gets `READY`; `moderationEntryEdit` only recognizes a log whose footer has an icon:
		vi.stubEnv('CLIENT_ID', botId);
		const fetch = vi.fn(async () => ({ displayAvatarURL: () => avatar }));
		container.gatewayClient = { user: null, users: { fetch } } as never;
		const entry = {
			id: 7,
			type: 1,
			reason: 'spam',
			createdAt: 0,
			userId: '666666666666666666',
			duration: null,
			messageReference: null,
			guild: { id: '254360814063058944' },
			extraData: null,
			fetchUser: async () => ({ id: '666666666666666666', username: 'target', discriminator: '0' }),
			fetchModerator: async () => ({ id: botId, username: 'bot', displayAvatarURL: () => avatar, tag: 'bot' }),
			isUndo: () => false,
			isTemporary: () => false
		};
		const t = ((key: string) => key) as never;

		const embed = await getEmbed(t, entry as never);

		expect(fetch).toHaveBeenCalledWith(botId);
		expect(embed?.toJSON().footer?.icon_url).toBe(avatar);
	});
});
