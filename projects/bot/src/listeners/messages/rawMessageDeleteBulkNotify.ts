import { readSettings } from '#lib/database';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { fetchGuildT } from '#lib/moderation/common';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { formatMessage, formatTimestamp } from '#utils/formatters';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { channelMention, messageLink, userMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsGatewayListener, snowflakeTimestamp } from '@wolfstar/plugin-gateway';
import type { AttachmentPayload, Message } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { GatewayMessageDeleteBulkDispatchData, Snowflake } from 'discord-api-types/v10';

@RegisterAsGatewayListener('messageDeleteBulk')
export class UserListener extends EventGatewayListener<'messageDeleteBulk'> {
	public async run(cachedMessages: Message[], data: GatewayMessageDeleteBulkDispatchData) {
		if (!data.guild_id) return;

		const guild = await this.container.gatewayClient.guilds.resolve(data.guild_id);
		if (!guild) return;

		const logger = await getLogger(guild);

		const channel = (await this.container.gatewayClient.channels.resolve(data.channel_id)) as GuildTextBasedChannel | null;
		if (!channel) return logger.prune.unset(data.channel_id);

		const messages = data.ids.map((id) => ({ id, message: cachedMessages.find((message) => message.id === id) ?? null }) as BulkMessageEntry);
		const contextPromise = logger.prune.wait(data.channel_id);

		const settings = await readSettings(guild);
		await logger.send({
			key: 'logsPrune',
			channelId: settings.logsPrune,
			condition: () =>
				!settings.logsIgnoreMessages.some((id) => id === channel.id && channel.parentId === id) ||
				!settings.logsIgnoreAll.some((id) => id === channel.id || channel.parentId === id),
			makeMessage: async () => {
				const t = await fetchGuildT(guild);
				const context = await contextPromise;
				const description = context
					? t('events/messages:messageDeleteBulk', {
							author: userMention(context.userId),
							channel: channelMention(channel.id),
							count: messages.length
						})
					: t('events/messages:messageDeleteBulkUnknown', {
							channel: channelMention(channel.id),
							count: messages.length
						});

				const embed = new EmbedBuilder()
					.setFooter({ text: t('events/messages:messageDeleteBulkFooter') })
					.setDescription(description)
					.setColor(Colors.Brown)
					.setTimestamp();

				return { embeds: [embed], files: [await this.generateAttachment(t, channel.id, guild.id, messages)] };
			},
			onAbort: () => logger.prune.unset(data.channel_id)
		});
	}

	private async generateAttachment(
		t: TFunction<AnyNamespace>,
		channelId: Snowflake,
		guildId: Snowflake,
		messages: readonly BulkMessageEntry[]
	): Promise<AttachmentPayload> {
		const header = t('commands/moderation:pruneLogHeader');
		const entries = await Promise.all(
			messages.map(async (entry) =>
				entry.message
					? formatMessage(t, entry.message)
					: `${formatTimestamp(t, snowflakeTimestamp(entry.id))} ${messageLink(channelId, entry.id, guildId)}`
			)
		);
		const processed = entries.reverse().join('\n\n');

		const buffer = Buffer.from(`${header}\n\n${processed}`);
		return { attachment: buffer, name: 'prune.txt' };
	}
}

interface BulkMessageEntry {
	id: string;
	message: GuildMessage | null;
}
