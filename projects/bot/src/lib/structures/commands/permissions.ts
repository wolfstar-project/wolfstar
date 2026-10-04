import { readSettings } from '#lib/database';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { createFunctionPrecondition } from '@wolfstar/decorators';
import { container } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The permission levels a command can require.
 *
 * - `Moderator`: the `rolesModerator` roles, or everybody when none is configured.
 * - `Administrator`: the `rolesAdmin` roles, or the `Manage Server` permission when none is configured.
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
 *    is how a server overrides the permissions of every command that is registered with Discord.
 * 2. This function then applies the role configuration of the guild (`rolesModerator` and `rolesAdmin`): when a list of
 *    roles is configured, membership in one of them is required, and when the list is empty the level falls back to the
 *    permission Discord already checked.
 *
 * The guild owner always passes.
 *
 * The `permissionNodes` of the guild, managed by `PermissionNodeManager` (the `permission-nodes` command), are matched
 * against the name and the category of the http-framework command pieces (see `lib/database/utils/matchers/Command.ts`),
 * but they are not consulted here: this function only applies the Discord permissions and the role configuration.
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
 * Resolves the message that tells the author of an interaction that they cannot run a command of the given level.
 *
 * @param interaction - The interaction that was denied.
 * @param level - The level the command requires.
 */
function getCommandPermissionDenialMessage(interaction: GuildChatInputInteraction, level: CommandPermissionLevel): string {
	const t = getSupportedUserLanguageT(interaction);
	const command = { name: interaction.data.name };
	return translateKey(t, level === CommandPermissionLevel.Administrator ? 'preconditions:administrator' : 'preconditions:moderator', { command });
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
	return getCommandPermissionDenialMessage(interaction, level);
}

/**
 * Decorator that only runs the decorated method when the author of the interaction is allowed to run a command of the
 * given level, see {@linkcode hasCommandPermissionLevel}. Otherwise, the author gets an ephemeral reply with the
 * localized reason and the method is skipped.
 *
 * @remarks The decorated method must receive the interaction as its first argument, and, as with every decorator
 * created by `createFunctionPrecondition`, it always returns a `Promise`.
 * @param level - The level the command requires.
 * @returns A method decorator.
 * @example
 * ```typescript
 * @RegisterCommand((builder) => applyLocalizedBuilder(builder, 'commands/management:rolesName', 'commands/management:rolesDescription'))
 * export class UserCommand extends Command {
 * 	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
 * 	public override chatInputRun(interaction: GuildChatInputInteraction) {
 * 		// Only runs for administrators.
 * 	}
 * }
 * ```
 */
export function RequiresCommandPermissionLevel(level: CommandPermissionLevel): MethodDecorator {
	return createFunctionPrecondition(
		(interaction: GuildChatInputInteraction) => hasCommandPermissionLevel(interaction, level),
		(interaction: GuildChatInputInteraction) =>
			interaction.reply({ content: getCommandPermissionDenialMessage(interaction, level), flags: MessageFlags.Ephemeral })
	);
}
