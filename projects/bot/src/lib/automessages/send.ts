import { resolveOnErrorCodes } from '#common';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import { AllowedMentionsTypes, PermissionFlagsBits, RESTJSONErrorCodes, type APIAllowedMentions, type Snowflake } from 'discord-api-types/v10';
import { setAutoMessageLastMessage, type AutoMessage } from 'wolfstar-database';

/**
 * What the bot needs in a channel to send an automatic message: to see it, to send in it, and to read its last message.
 */
export const AutoMessagePermissions = {
	ViewChannel: PermissionFlagsBits.ViewChannel,
	SendMessages: PermissionFlagsBits.SendMessages,
	ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory
} as const;

const RequiredPermissions = Object.values(AutoMessagePermissions).reduce((bits, bit) => bits | bit, 0n);

/**
 * What became of an automatic message: it was `sent`, the channel was `idle` (its last message is still the one the bot
 * sent), its channel is `gone`, or the bot is `missing` the permissions to send it.
 */
export type AutoMessageResult = 'sent' | 'idle' | 'gone' | 'missing';

/**
 * Whether an automatic message is sent again: not while the last message of the channel is still the one the bot sent,
 * so a channel nobody writes in does not fill up with it.
 *
 * @param latestMessageId - The ID of the last message of the channel, `null` when it has none.
 * @param lastSentId - The ID of the message the bot sent last, `null` before the first one.
 */
export function shouldSendAutoMessage(latestMessageId: Snowflake | null, lastSentId: Snowflake | null): boolean {
	return lastSentId === null || latestMessageId !== lastSentId;
}

/**
 * Which mentions of an automatic message ping who they mention: none, unless the administrator asked for them.
 */
export function getAutoMessageAllowedMentions(mentions: boolean): APIAllowedMentions {
	return mentions ? { parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role, AllowedMentionsTypes.Everyone] } : { parse: [] };
}

/**
 * Sends an automatic message once, unless the channel is idle, and remembers the message it sent.
 *
 * @param message - The automatic message.
 */
export async function runAutoMessage(message: AutoMessage): Promise<AutoMessageResult> {
	const { gatewayClient, prisma } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(message.channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !('guildId' in channel) || channel.guildId !== message.guildId) return 'gone';

	const me = await gatewayClient.members.fetchMe(message.guildId);
	const permissions = await computePermissionsIn(channel, me);
	if (!permissions.has(RequiredPermissions)) return 'missing';

	const [latest] = await gatewayClient.api.channels.getMessages(message.channelId, { limit: 1 });
	if (!shouldSendAutoMessage(latest?.id ?? null, message.lastMessageId)) return 'idle';

	const sent = await gatewayClient.api.channels.createMessage(message.channelId, {
		content: message.content,
		allowed_mentions: getAutoMessageAllowedMentions(message.mentions)
	});
	await setAutoMessageLastMessage(prisma, message.id, sent.id);
	return 'sent';
}
