import { readSettings } from '#lib/database';
import { hasLegacyPermissions } from '#lib/structures/commands-menu/legacy';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { fetchCommandIds, getCommandCatalog } from '#lib/structures/commands-menu/catalog';
import type { CommandsMenuContext } from '#lib/structures/commands-menu/render';
import { createTranslator } from '#lib/structures/commands/utils';
import { getSupportedUserLanguageT, type Target } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

export * from '#lib/structures/commands-menu/catalog';
export * from '#lib/structures/commands-menu/render';
export * from '#lib/structures/commands-menu/restrictions';

/**
 * Creates the context the commands menu is rendered with: the language of the user and the commands in it.
 *
 * @param interaction - The interaction the menu answers.
 * @param ownerId - The user who opened the menu.
 * @param options.legacy - Whether to look for the permission nodes a server still stores, for the notice of a page of
 * the menu. It reads the settings and the level of the member, so only what renders a page asks for it, not the
 * autocomplete nor a modal.
 */
export async function createCommandsMenuContext(
	interaction: Target & { locale: string; guildId?: string | null; member?: GuildChatInputInteraction['member'] },
	ownerId: Snowflake,
	options: { legacy?: boolean } = {}
): Promise<CommandsMenuContext> {
	return {
		hasLegacyPermissions: options.legacy === true && (await showsLegacyPermissions(interaction)),
		t: createTranslator(getSupportedUserLanguageT(interaction)),
		ownerId,
		commands: getCommandCatalog(interaction.locale),
		ids: await fetchCommandIds()
	};
}

/**
 * Whether the notice of the permission nodes is shown: the server still stores some, and the member is an administrator.
 */
async function showsLegacyPermissions(interaction: { guildId?: string | null; member?: GuildChatInputInteraction['member'] }): Promise<boolean> {
	const { guildId, member } = interaction;
	if (!guildId || !member) return false;

	const settings = await readSettings(guildId);
	if (!hasLegacyPermissions(settings)) return false;

	return hasCommandPermissionLevel({ guildId, member }, CommandPermissionLevel.Administrator);
}
