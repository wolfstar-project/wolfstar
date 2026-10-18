import { days } from 'wolfstar-shared';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn, type Guild, type Message } from '@wolfstar/plugin-gateway';
import { ChannelType, PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';
import { createMessageHistory, setMessageHistoryCase, type MessageHistory, type MessageHistoryMessage } from 'wolfstar-database';

/**
 * The most channels a history reads, the ones with the latest messages first: each one is a request to Discord.
 */
export const MaximumHistoryChannels = 50;

/**
 * The most messages a history keeps, the newest ones.
 */
export const MaximumHistoryMessages = 200;

/**
 * How far back a history looks.
 */
export const HistoryWindow = days(14);

const TextChannelTypes = new Set<ChannelType>([
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
	ChannelType.GuildVoice,
	ChannelType.GuildStageVoice
]);

/**
 * Turns the messages of a member into the messages of a history, newest first, keeping the ones within the window and
 * at most {@linkcode MaximumHistoryMessages}.
 *
 * @param messages - The messages that were read, of every author.
 * @param userId - The member.
 * @param now - The time the window counts back from.
 */
export function selectHistoryMessages(
	messages: Iterable<
		// The attachments of a message are a collection, the ones of the tests an array: both have `values()`.
		Pick<Message, 'id' | 'channelId' | 'content' | 'createdTimestamp'> & {
			author: { id: string };
			attachments: { values(): Iterable<{ url: string }> };
		}
	>,
	userId: Snowflake,
	now = Date.now()
): MessageHistoryMessage[] {
	const since = now - HistoryWindow;
	const selected: MessageHistoryMessage[] = [];
	for (const message of messages) {
		if (message.author.id !== userId || message.createdTimestamp < since) continue;

		selected.push({
			id: message.id,
			channelId: message.channelId,
			content: message.content,
			createdAt: message.createdTimestamp,
			attachments: Array.from(message.attachments.values(), (attachment) => attachment.url)
		});
	}

	return selected.sort((a, b) => b.createdAt - a.createdAt).slice(0, MaximumHistoryMessages);
}

/**
 * Reads the latest messages of the text channels of a guild the bot can read, the ones with the latest messages first,
 * and keeps the ones of a member.
 *
 * @param guild - The guild.
 * @param userId - The member.
 */
export async function collectMemberMessages(guild: Guild, userId: Snowflake): Promise<MessageHistoryMessage[]> {
	const { gatewayClient } = container;
	const me = await gatewayClient.members.fetchMe(guild.id);
	const required = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;

	const readable: { id: string; lastMessageId: string | null }[] = [];
	for (const channel of await guild.channels.fetch()) {
		if (!TextChannelTypes.has(channel.type)) continue;
		if (!(await computePermissionsIn(channel, me)).has(required)) continue;

		const lastMessageId = 'lastMessageId' in channel ? ((channel.lastMessageId as string | null | undefined) ?? null) : null;
		readable.push({ id: channel.id, lastMessageId });
	}

	// The channels with the latest messages are the ones a member most likely wrote in lately:
	readable.sort((a, b) => compareSnowflakes(b.lastMessageId, a.lastMessageId));

	const messages: Message[] = [];
	for (const channel of readable.slice(0, MaximumHistoryChannels)) {
		const page = await gatewayClient.messages.list(channel.id, { limit: 100 }).catch(() => [] as Message[]);
		messages.push(...page);
	}

	return selectHistoryMessages(messages, userId);
}

function compareSnowflakes(a: string | null, b: string | null) {
	if (a === b) return 0;
	if (a === null) return -1;
	if (b === null) return 1;
	return BigInt(a) < BigInt(b) ? -1 : 1;
}

/**
 * Collects the recent messages of a member and saves them as a message history.
 *
 * @param guild - The guild.
 * @param userId - The member.
 * @param moderatorId - Who saved it.
 * @param caseId - The case it is for, when it is made before the case, see {@linkcode linkMessageHistory}.
 */
export async function archiveMemberMessages(
	guild: Guild,
	userId: Snowflake,
	moderatorId: Snowflake,
	caseId: number | null = null
): Promise<MessageHistory> {
	const messages = await collectMemberMessages(guild, userId);
	return createMessageHistory(container.prisma, guild.id, { userId, moderatorId, caseId, messages });
}

/**
 * Links a history to the case it was made for, once the case exists.
 */
export function linkMessageHistory(guildId: Snowflake, historyId: string, caseId: number) {
	return setMessageHistoryCase(container.prisma, guildId, historyId, caseId);
}

/**
 * Writes a history as text, the file a moderator downloads: a line for each message, oldest first, with when and where
 * it was sent and the links of its attachments.
 *
 * @param history - The history.
 * @param channelName - The name of a channel by its ID, its ID when it is gone.
 */
export function renderMessageHistory(history: MessageHistory, channelName: (channelId: Snowflake) => string): string {
	const lines = [...history.messages]
		.sort((a, b) => a.createdAt - b.createdAt)
		.map((message) => {
			const attachments = message.attachments.length === 0 ? '' : ` [${message.attachments.join(' ')}]`;
			return `[${new Date(message.createdAt).toISOString()}] #${channelName(message.channelId)}: ${message.content}${attachments}`;
		});

	return [
		`Message history ${history.id} of ${history.userId}, saved by ${history.moderatorId} on ${new Date(history.createdAt).toISOString()}${history.caseId === null ? '' : ` for the case ${history.caseId}`}`,
		`${history.messages.length} messages`,
		'',
		...lines
	].join('\n');
}
