import { transformOauthGuildsAndUser } from '#lib/api/utils';
import { container } from '@sapphire/framework';
import { PermissionFlagsBits } from 'discord.js';
import { client, createGuild } from '../../mocks/MockInstances.js';

describe('transformOauthGuildsAndUser', () => {
	const user = { id: '242043489611808769', username: 'Owner', discriminator: '0001', avatar: null };

	beforeAll(() => {
		Object.assign(container, { client });
	});

	afterEach(() => {
		client.guilds.cache.clear();
	});

	it('returns only guilds where the bot is present and the user can manage', async () => {
		const botGuild = createGuild({ id: '111111111111111111', name: 'Bot Guild' });
		const oauthGuilds = [
			{
				id: botGuild.id,
				name: botGuild.name,
				icon: null,
				owner: true,
				permissions: PermissionFlagsBits.Administrator.toString()
			},
			{
				id: '222222222222222222',
				name: 'Left Guild',
				icon: null,
				owner: true,
				permissions: PermissionFlagsBits.Administrator.toString()
			}
		];

		const result = await transformOauthGuildsAndUser({ user, guilds: oauthGuilds });

		expect(result.transformedGuilds).toHaveLength(1);
		expect(result.transformedGuilds![0]).toMatchObject({
			id: botGuild.id,
			wolfstarIsIn: true,
			manageable: true
		});
	});
});
