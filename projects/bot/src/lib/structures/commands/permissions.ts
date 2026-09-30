import { readSettings } from '#lib/database';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { container } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The replacement of the `PermissionLevels` the prefix commands declared.
 *
 * - `Moderator`: the old `PermissionLevels.Moderator`.
 * - `Administrator`: the old `PermissionLevels.Administrator`.
 */
export enum CommandPermissionLevel {
	Moderator,
	Administrator
}

/**
 * Checks whether the author of an interaction is allowed to run a command of the given level.
 *
 * @remarks
 *
 * Slash commands are gated twice:
 *
 * 1. Discord hides and rejects the command for the members that do not hold the permissions given to
 *    `setDefaultMemberPermissions`. A server can widen or narrow that through `Server Settings > Integrations`, which
 *    replaces the `permissionNodes` overrides of the prefix commands for every command that is registered with Discord.
 * 2. This function then applies the role configuration of the guild (`rolesModerator` and `rolesAdmin`), which is what
 *    `PermissionLevels` resolved to before: when a list of roles is configured, membership in one of them is required,
 *    and when the list is empty the level falls back to the permission Discord already checked.
 *
 * The guild owner always passes.
 *
 * `PermissionNodeManager` (the `permission-nodes` command) still matches commands by their prefix name, category and
 * aliases, which slash commands do not have. Until it resolves slash command names, its nodes are not consulted here.
 *
 * @param interaction - The interaction to check.
 * @param level - The level the command requires.
 */
export async function hasCommandPermissionLevel(interaction: GuildChatInputInteraction, level: CommandPermissionLevel): Promise<boolean> {
	const { member } = interaction;
	const guild = await container.gatewayClient.guilds.fetch(interaction.guildId);
	if (member.user.id === guild.ownerId) return true;

	const settings = await readSettings(interaction.guildId);
	const roles = new Set(member.roles);

	const administratorRoles = settings.rolesAdmin;
	const isAdministrator =
		administratorRoles.length === 0
			? (BigInt(member.permissions) & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild
			: administratorRoles.some((id: string) => roles.has(id));
	if (level === CommandPermissionLevel.Administrator) return isAdministrator;

	const moderatorRoles = settings.rolesModerator;
	if (moderatorRoles.length === 0) return true;
	return isAdministrator || moderatorRoles.some((id: string) => roles.has(id));
}

/**
 * Runs {@linkcode hasCommandPermissionLevel} and, when the author is not allowed, resolves the message to tell them.
 *
 * @param interaction - The interaction to check.
 * @param level - The level the command requires.
 * @returns The localized error message, or `null` if the author is allowed to run the command.
 */
export async function getCommandPermissionDenial(interaction: GuildChatInputInteraction, level: CommandPermissionLevel): Promise<string | null> {
	if (await hasCommandPermissionLevel(interaction, level)) return null;

	const t = getSupportedUserLanguageT(interaction);
	const command = { name: interaction.data.name };
	return translateKey(t, level === CommandPermissionLevel.Administrator ? 'preconditions:administrator' : 'preconditions:moderator', { command });
}
