import { readSettings, readSettingsPermissionNodes } from '#lib/database';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { createFunctionPrecondition } from '@wolfstar/decorators';
import { container } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';
import { hasDashboardAccessEntries, resolveDashboardAccess, type DashboardAccessRole } from 'wolfstar-database';

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
 * The `permissionNodes` of the guild, managed by `PermissionNodeManager` (legacy rules reviewed through `/commands`), are matched
 * against the name and the category of the http-framework command pieces (see `lib/database/utils/matchers/Command.ts`),
 * but they are not consulted here: this function only applies the Discord permissions and the role configuration.
 *
 * @param interaction - The interaction to check.
 * @param level - The level the command requires.
 */
export async function hasCommandPermissionLevel(
	interaction: Pick<GuildChatInputInteraction, 'guildId' | 'member'>,
	level: CommandPermissionLevel
): Promise<boolean> {
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
 * A member who asks to manage the settings of a server, from the dashboard or from Discord.
 */
export interface ServerSettingsManager {
	guildId: Snowflake;
	userId: Snowflake;
	/** The roles the member holds, `@everyone` left out. */
	roleIds: readonly Snowflake[];
	/** Whether the member has `Manage Server`, or `Administrator`, which the caller reads the way its member allows. */
	manageGuild: boolean;
}

/**
 * Whether a member may manage the settings of a server: the dashboard and the API, the settings menu, the import of
 * the settings and the editor of `/commands`. It is the rule wolfstar.rocks applies, in the same order:
 *
 * 1. the owner always may;
 * 2. a dashboard access rule that names the member decides on its own, see `resolveDashboardAccess`: an `allow` lets
 *    in a member without `Manage Server`, a `deny` keeps out an administrator;
 * 3. with no rule, an administrator may (the `rolesAdmin` roles, or `Manage Server` when there are none), unless a
 *    legacy permission node denies them the `settings` command.
 *
 * @param manager - The member who asks.
 */
export async function canManageServerSettings(manager: ServerSettingsManager): Promise<boolean> {
	const guild = await container.gatewayClient.guilds.fetch(manager.guildId);
	if (manager.userId === guild.ownerId) return true;

	const settings = await readSettings(manager.guildId);
	const entries = { users: settings.permissionsUsers, roles: settings.permissionsRoles };
	// The roles of the guild are only read when a rule of a role could decide:
	const roles: DashboardAccessRole[] = hasDashboardAccessEntries(entries.roles)
		? (await container.gatewayClient.roles.fetchAll(manager.guildId)).map((role) => ({ id: role.id, position: role.position }))
		: [];
	const access = resolveDashboardAccess({ userId: manager.userId, roleIds: manager.roleIds }, entries, roles);
	if (access !== null) return access === 'allow';

	// `@everyone`, whose ID is the guild's, can be one of the administrator roles:
	const held = new Set([manager.guildId, ...manager.roleIds]);
	const isAdministrator = settings.rolesAdmin.length === 0 ? manager.manageGuild : settings.rolesAdmin.some((id) => held.has(id));
	if (!isAdministrator) return false;

	const command = container.stores.get('commands').get('settings');
	if (command === undefined) return true;
	return (await readSettingsPermissionNodes(settings).run({ id: manager.userId, roleIds: manager.roleIds }, command)) ?? true;
}

/**
 * Runs {@linkcode canManageServerSettings} for the author of an interaction of a guild.
 *
 * @param interaction - The interaction, which has the member and the permissions Discord computed for them.
 */
export function canManageServerSettingsFrom(interaction: {
	guildId: Snowflake;
	member: { user: { id: Snowflake }; roles: readonly Snowflake[]; permissions: string };
}) {
	const { member } = interaction;
	const permissions = BigInt(member.permissions);
	const bits = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
	return canManageServerSettings({
		guildId: interaction.guildId,
		userId: member.user.id,
		roleIds: member.roles,
		manageGuild: (permissions & bits) !== 0n
	});
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
 * The levels {@linkcode RequiresCommandPermissionLevel} requires to run `chatInputRun`, by the prototype it decorates.
 */
const ChatInputPermissionLevels = new WeakMap<object, CommandPermissionLevel>();

/**
 * Decorator that only runs the decorated method when the author of the interaction is allowed to run a command of the
 * given level, see {@linkcode hasCommandPermissionLevel}. Otherwise, the author gets an ephemeral reply with the
 * localized reason and the method is skipped.
 *
 * @remarks Prefer the `moderator` and `administrator` preconditions (`src/preconditions`), named in the `preconditions`
 * option of the command: a subcommand is run through its parent, so the option goes there. This decorator is for the
 * subcommands of a parent whose subcommands have different levels (`/settings server`, `/mute create`).
 *
 * The decorated method must receive the interaction as its first argument, and, as with every decorator
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
	const decorator = createFunctionPrecondition(
		(interaction: GuildChatInputInteraction) => hasCommandPermissionLevel(interaction, level),
		(interaction: GuildChatInputInteraction) =>
			interaction.reply({ content: getCommandPermissionDenialMessage(interaction, level), flags: MessageFlags.Ephemeral })
	);

	return (target, propertyKey, descriptor) => {
		if (propertyKey === 'chatInputRun') ChatInputPermissionLevels.set(target, level);
		return decorator(target, propertyKey, descriptor);
	};
}

/**
 * Reads the level {@linkcode RequiresCommandPermissionLevel} requires to run the chat input method of a command piece,
 * which `GET /commands` lists for a subcommand.
 *
 * @param piece - The command piece, of a command or of a subcommand.
 * @returns The level, `null` when its `chatInputRun` requires none.
 */
export function getRequiredCommandPermissionLevel(piece: object): CommandPermissionLevel | null {
	for (let prototype: object | null = Object.getPrototypeOf(piece); prototype !== null; prototype = Object.getPrototypeOf(prototype)) {
		const level = ChatInputPermissionLevels.get(prototype);
		if (level !== undefined) return level;
		// A `chatInputRun` that is not decorated replaces the one of the class it extends:
		if (Object.hasOwn(prototype, 'chatInputRun')) return null;
	}

	return null;
}

/**
 * Decorator that only runs the decorated method when the author of the interaction may manage the settings of the
 * server, see {@linkcode canManageServerSettings}; otherwise they get the reply of the administrator level. It records
 * the administrator level for `GET /commands`, as {@linkcode RequiresCommandPermissionLevel} does.
 */
export function RequiresServerSettingsManagement(): MethodDecorator {
	const decorator = createFunctionPrecondition(
		(interaction: GuildChatInputInteraction) => canManageServerSettingsFrom(interaction),
		(interaction: GuildChatInputInteraction) =>
			interaction.reply({
				content: getCommandPermissionDenialMessage(interaction, CommandPermissionLevel.Administrator),
				flags: MessageFlags.Ephemeral
			})
	);

	return (target, propertyKey, descriptor) => {
		if (propertyKey === 'chatInputRun') ChatInputPermissionLevels.set(target, CommandPermissionLevel.Administrator);
		return decorator(target, propertyKey, descriptor);
	};
}
