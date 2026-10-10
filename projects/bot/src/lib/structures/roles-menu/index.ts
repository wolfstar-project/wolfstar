import { sortRoles, type RolesMenuContext } from '#lib/structures/roles-menu/render';
import { createTranslator } from '#lib/structures/commands/utils';
import { container } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT, type Target } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

export * from '#lib/structures/roles-menu/render';

/**
 * Creates the context the roles menu is rendered with: the language of the user, the server and its roles.
 *
 * @param interaction - The interaction the menu answers.
 * @param guildId - The server the menu is of.
 * @param ownerId - The user who opened the menu.
 */
export async function createRolesMenuContext(interaction: Target, guildId: Snowflake, ownerId: Snowflake): Promise<RolesMenuContext> {
	const { gatewayClient } = container;
	const [guild, roles] = await Promise.all([gatewayClient.guilds.fetch(guildId), gatewayClient.roles.fetchAll(guildId)]);

	return {
		t: createTranslator(getSupportedUserLanguageT(interaction)),
		ownerId,
		guildName: guild.name,
		roles: sortRoles(
			roles.map((role) => ({
				id: role.id,
				name: role.name,
				color: role.color,
				hoist: role.hoist,
				mentionable: role.mentionable,
				position: role.position,
				permissions: BigInt(role.permissions.bitField)
			}))
		)
	};
}
