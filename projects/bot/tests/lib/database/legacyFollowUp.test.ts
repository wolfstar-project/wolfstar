import { followUpLegacyGuild } from '#lib/database/legacyFollowUp';
import { convertGuildCommandRules } from '#lib/structures/commands-menu/convertGuild';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

vi.mock('#lib/structures/commands-menu/convertGuild', () => ({ convertGuildCommandRules: vi.fn() }));

function discordError(code: number) {
	return new DiscordAPIError({ code, message: 'Refused' }, code, 403, 'GET', '/guilds/1/roles', {});
}

describe('followUpLegacyGuild', () => {
	const guildId = '254360814063058944';
	const where = vi.fn(() => ({
		first: () => Promise.resolve({ users: [{ id: '1', allow: ['ban'], deny: [] }], roles: [] }),
		all: () => Promise.resolve([])
	}));

	beforeEach(() => {
		vi.mocked(convertGuildCommandRules).mockReset();
		(container as { prisma: unknown }).prisma = { orm: { public: { GuildPermissions: { where }, ModerationAction: { where } } } };
	});

	test('GIVEN a guild with nodes THEN they are converted', async () => {
		await followUpLegacyGuild(guildId, '1');
		expect(convertGuildCommandRules).toHaveBeenCalledWith(guildId, '1');
	});

	test.each([RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.UnknownGuild])(
		'GIVEN a guild the bot left (%i) THEN it is done with, so it is not tried at every start',
		async (code) => {
			vi.mocked(convertGuildCommandRules).mockRejectedValue(discordError(code));
			await expect(followUpLegacyGuild(guildId, '1')).resolves.toBeUndefined();
		}
	);

	test('GIVEN any other failure THEN it stays pending', async () => {
		vi.mocked(convertGuildCommandRules).mockRejectedValue(new Error('Redis is down'));
		await expect(followUpLegacyGuild(guildId, '1')).rejects.toThrow('Redis is down');
	});
});
