import { container } from '@wolfstar/http-framework';
import { canSendMessages } from '@wolfstar/http-framework-utilities/gateway';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Sends a greeting to a channel of the guild, mentioning only the member it is about. A channel that is gone, or the
 * bot cannot post in, is skipped.
 *
 * @param channelId - The channel.
 * @param content - The message.
 * @param userId - The member, the only one it pings.
 * @returns Whether it was sent.
 */
export async function sendGreeting(channelId: Snowflake, content: string, userId: Snowflake): Promise<boolean> {
	const channel = await container.gatewayClient.channels.fetch(channelId).catch(() => null);
	if (channel === null || !('send' in channel) || !(await canSendMessages(channel))) return false;

	await channel.send({ content, allowed_mentions: { users: [userId] } });
	return true;
}
