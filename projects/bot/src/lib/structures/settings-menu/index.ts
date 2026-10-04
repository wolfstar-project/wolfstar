import { readSettings } from '#lib/database';
import { createTranslator } from '#lib/structures/commands/utils';
import type { SettingsMenuContext } from '#lib/structures/settings-menu/render';
import { container } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

export * from '#lib/structures/settings-menu/ids';
export * from '#lib/structures/settings-menu/render';
export * from '#lib/structures/settings-menu/values';

/**
 * Creates the context the settings menu is rendered with: the language of the user, and the name and the settings of the
 * guild.
 *
 * @param interaction - The interaction the menu answers.
 * @param guildId - The ID of the guild the settings are of.
 * @param ownerId - The user who opened the menu.
 */
export async function createSettingsMenuContext(
	interaction: Parameters<typeof getSupportedUserLanguageT>[0],
	guildId: Snowflake,
	ownerId: Snowflake
): Promise<SettingsMenuContext> {
	const guild = await container.gatewayClient.guilds.fetch(guildId);
	return {
		t: createTranslator(getSupportedUserLanguageT(interaction)),
		ownerId,
		guildName: guild.name,
		settings: await readSettings(guildId)
	};
}
