import { fetchCommandIds, getCommandCatalog } from '#lib/structures/commands-menu/catalog';
import type { CommandsMenuContext } from '#lib/structures/commands-menu/render';
import { createTranslator } from '#lib/structures/commands/utils';
import { getSupportedUserLanguageT, type Target } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

export * from '#lib/structures/commands-menu/catalog';
export * from '#lib/structures/commands-menu/render';

/**
 * Creates the context the commands menu is rendered with: the language of the user and the commands in it.
 *
 * @param interaction - The interaction the menu answers.
 * @param ownerId - The user who opened the menu.
 */
export async function createCommandsMenuContext(interaction: Target & { locale: string }, ownerId: Snowflake): Promise<CommandsMenuContext> {
	return {
		t: createTranslator(getSupportedUserLanguageT(interaction)),
		ownerId,
		commands: getCommandCatalog(interaction.locale),
		ids: await fetchCommandIds()
	};
}
