import { resolveOnErrorCodes } from '#common';
import { fetchGuildT } from '#lib/moderation/common';
import { Colors } from '#utils/constants';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ChannelType,
	ComponentType,
	MessageFlags,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	type RESTPostAPIChannelMessageJSONBody,
	type Snowflake
} from 'discord-api-types/v10';
import type { HoneypotAction } from 'wolfstar-database';

/**
 * How many of the latest messages of the honeypot channel are looked at for the ones of the bot. Nothing else stays in
 * the channel, so its own are among the first.
 */
const NoticeScanLimit = 50;

/**
 * The errors that mean a message is already gone, or that the bot can no longer delete it.
 */
const IgnoredDeleteCodes = [
	RESTJSONErrorCodes.UnknownMessage,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
] as const;

/**
 * What the bot needs in the honeypot channel whatever the action is: to see what is written there, to delete it, and
 * to send its warning.
 */
const ChannelPermissions = {
	ViewChannel: PermissionFlagsBits.ViewChannel,
	SendMessages: PermissionFlagsBits.SendMessages,
	ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
	ManageMessages: PermissionFlagsBits.ManageMessages
} as const;

/**
 * What each action needs on top of {@linkcode ChannelPermissions}.
 */
const ActionPermissions = {
	Kick: { KickMembers: PermissionFlagsBits.KickMembers },
	Softban: { BanMembers: PermissionFlagsBits.BanMembers },
	Ban: { BanMembers: PermissionFlagsBits.BanMembers }
} as const satisfies Record<HoneypotAction, Record<string, bigint>>;

/**
 * The permissions the bot needs to run the honeypot in a channel and does not have.
 *
 * @param guildId - The guild of the channel.
 * @param channelId - The honeypot channel.
 * @param action - What is done to who writes in the channel, which needs a permission of its own.
 * @returns Their names, none when the bot has them all, or `null` when the channel is not one of the guild.
 */
export async function getMissingHoneypotPermissions(guildId: Snowflake, channelId: Snowflake, action: HoneypotAction): Promise<string[] | null> {
	const { gatewayClient } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !('guildId' in channel) || channel.guildId !== guildId) return null;

	const permissions = await computePermissionsIn(channel, await gatewayClient.members.fetchMe(guildId));
	return Object.entries({ ...ChannelPermissions, ...ActionPermissions[action] })
		.filter(([, bit]) => !permissions.has(bit))
		.map(([name]) => name);
}

/**
 * Creates the channel of the honeypot, at the top of the list of the guild: the bots that post in every channel start
 * there.
 *
 * @param guildId - The guild to create the channel in.
 * @returns The ID of the channel, or `null` when the bot cannot create channels.
 */
export async function createHoneypotChannel(guildId: Snowflake): Promise<Snowflake | null> {
	const t = await fetchGuildT({ id: guildId });
	const channel = await resolveOnErrorCodes(
		container.gatewayClient.api.guilds.createChannel(
			guildId,
			{ name: t('commands/honeypot:channelName'), type: ChannelType.GuildText, topic: t('commands/honeypot:channelTopic'), position: 0 },
			{ reason: 'Honeypot' }
		),
		RESTJSONErrorCodes.MissingPermissions,
		RESTJSONErrorCodes.MissingAccess
	);
	return channel?.id ?? null;
}

/**
 * Builds the warning the bot keeps in the honeypot channel, which says what happens to who writes there.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param action - What is done to who writes in the channel.
 */
export function renderHoneypotNotice(t: TFunction<AnyNamespace>, action: HoneypotAction) {
	const content = t('commands/honeypot:notice', {
		title: t('commands/honeypot:noticeTitle'),
		description: t('commands/honeypot:noticeDescription'),
		consequence: t(`commands/honeypot:notice${action}`)
	});

	return {
		components: [{ type: ComponentType.Container, accent_color: Colors.Red, components: [{ type: ComponentType.TextDisplay, content }] }],
		flags: MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	} satisfies RESTPostAPIChannelMessageJSONBody;
}

/**
 * Removes the messages the bot left in the honeypot channel, and sends its warning again when the guild wants one.
 *
 * @remarks
 *
 * Nothing says which message is the warning: what the members write in the channel is deleted, so the messages of the
 * bot among the latest ones are its warnings, and they are all replaced. A new message also makes the channel the
 * latest one that had activity.
 *
 * @param guildId - The guild of the channel.
 * @param channelId - The honeypot channel.
 * @param options - Whether a warning is sent, and the action it tells about.
 * @returns Whether the channel has the warning the guild wants, `false` when it could not be sent.
 */
export async function refreshHoneypotNotice(
	guildId: Snowflake,
	channelId: Snowflake,
	options: { warning: boolean; action: HoneypotAction }
): Promise<boolean> {
	const { gatewayClient } = container;
	const botId = gatewayClient.user!.id;

	const latest = await resolveOnErrorCodes(gatewayClient.messages.list(channelId, { limit: NoticeScanLimit }), ...IgnoredDeleteCodes);
	for (const message of latest ?? []) {
		if (message.author.id !== botId) continue;
		await resolveOnErrorCodes(gatewayClient.messages.delete(channelId, message.id, 'Honeypot'), ...IgnoredDeleteCodes);
	}

	if (!options.warning) return true;

	const t = await fetchGuildT({ id: guildId });
	const sent = await resolveOnErrorCodes(
		gatewayClient.api.channels.createMessage(channelId, renderHoneypotNotice(t, options.action)),
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.MissingAccess,
		RESTJSONErrorCodes.MissingPermissions
	);
	return sent !== null;
}
