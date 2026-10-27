import { resolveOnErrorCodes } from '#common';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

/**
 * Why the bot cannot give or take a role: it does not exist, it is `@everyone` or managed by an integration, the bot
 * lacks `Manage Roles`, or the role is not below the highest role of the bot.
 */
export type JoinGuardRoleProblem = 'unknown' | 'everyone' | 'managed' | 'missingPermission' | 'above';

/**
 * Reads why the bot cannot give or take a role of a guild.
 *
 * @param guildId - The guild of the role.
 * @param roleId - The role.
 * @returns The problem, `null` when the bot can.
 */
export async function getJoinGuardRoleProblem(guildId: Snowflake, roleId: Snowflake): Promise<JoinGuardRoleProblem | null> {
	if (roleId === guildId) return 'everyone';

	const { gatewayClient } = container;
	const role = await resolveOnErrorCodes(gatewayClient.roles.fetch(guildId, roleId), RESTJSONErrorCodes.UnknownRole);
	if (role === null) return 'unknown';
	if (role.managed) return 'managed';

	const me = await gatewayClient.members.fetchMe(guildId);
	if (!(await me.fetchPermissions()).has(PermissionFlagsBits.ManageRoles)) return 'missingPermission';

	const highest = await me.roles.fetchHighest();
	// A tie of positions is broken by the ID of the role, as Discord does:
	return highest === null || highest.comparePositionTo(role) <= 0 ? 'above' : null;
}

/**
 * What the bot needs in a channel it posts the logs, the alerts or the checkpoint button in, which is what the
 * `guildMessageLog` listener asks for (`canSendEmbeds`) before it sends.
 */
const ChannelPermissions = {
	ViewChannel: PermissionFlagsBits.ViewChannel,
	SendMessages: PermissionFlagsBits.SendMessages,
	EmbedLinks: PermissionFlagsBits.EmbedLinks
} as const;

/**
 * The permissions the bot needs to post in a channel of a guild and does not have.
 *
 * @param guildId - The guild of the channel.
 * @param channelId - The channel.
 * @returns Their names, none when the bot has them all, or `null` when the channel is not one of the guild.
 */
export async function getMissingJoinGuardChannelPermissions(guildId: Snowflake, channelId: Snowflake): Promise<string[] | null> {
	const { gatewayClient } = container;
	const channel = await resolveOnErrorCodes(
		gatewayClient.channels.fetch(channelId),
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.MissingAccess
	);
	if (channel === null || !('guildId' in channel) || channel.guildId !== guildId) return null;

	const permissions = await computePermissionsIn(channel, await gatewayClient.members.fetchMe(guildId));
	return Object.entries(ChannelPermissions)
		.filter(([, bit]) => !permissions.has(bit))
		.map(([name]) => name);
}

/**
 * The permissions of the guild the actions of the guard need, by what needs them.
 */
const ActionPermissions = {
	kick: { KickMembers: PermissionFlagsBits.KickMembers },
	ban: { BanMembers: PermissionFlagsBits.BanMembers },
	roles: { ManageRoles: PermissionFlagsBits.ManageRoles }
} as const;

export type JoinGuardAction = keyof typeof ActionPermissions;

/**
 * The permissions of a guild the bot needs for some actions of the guard and does not have.
 *
 * @param guildId - The guild.
 * @param actions - What the guard is about to do.
 * @returns Their names, none when the bot has them all.
 */
export async function getMissingJoinGuardPermissions(guildId: Snowflake, actions: Iterable<JoinGuardAction>): Promise<string[]> {
	const me = await container.gatewayClient.members.fetchMe(guildId);
	const permissions = await me.fetchPermissions();
	const missing = new Set<string>();
	for (const action of actions) {
		for (const [name, bit] of Object.entries(ActionPermissions[action])) {
			if (!permissions.has(bit)) missing.add(name);
		}
	}

	return [...missing];
}
