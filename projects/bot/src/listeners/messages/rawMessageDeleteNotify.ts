import { readSettings } from '#lib/database';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { fetchGuildT } from '#lib/moderation/common';
import { getMessageLogButtons } from '#lib/moderation/logs/messageButtons';
import { Colors } from '#utils/constants';
import { createEventLogMessage, getLogger } from '#utils/functions';
import { getContent, getImages } from '#utils/util';
import { channelMention, userMention } from '@discordjs/formatters';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { isNsfwChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { Message } from '@wolfstar/plugin-gateway';
import type { GatewayMessageDeleteDispatchData } from 'discord-api-types/v10';
import type { GuildDataKey, ReadonlyGuildData } from 'wolfstar-database';

@RegisterAsDispatchListener('messageDelete')
export class UserListener extends EventGatewayListener<'messageDelete'> {
	public async run(message: Message | null, data: GatewayMessageDeleteDispatchData) {
		if (!data.guild_id) return;

		const guild = await this.container.gatewayClient.guilds.resolve(data.guild_id);
		if (!guild) return;

		const channel = (await this.container.gatewayClient.channels.resolve(data.channel_id)) as GuildTextBasedChannel | null;
		if (!channel) return;

		const settings = await readSettings(guild);
		const key: GuildDataKey = isNsfwChannel(channel) ? 'logsMessageDeleteNsfw' : 'logsMessageDelete';
		const logger = await getLogger(guild);
		await logger.send({
			key,
			channelId: settings[key],
			condition: () => this.onCondition(message, channel, settings),
			makeMessage: async () => {
				// The condition aborts the log of a message that is not cached:
				if (isNullish(message)) return null;

				const t = await fetchGuildT(guild);
				const content = getContent(message);
				const images = [...getImages(message)];
				return createEventLogMessage({
					color: Colors.Red,
					title: t('events/messages:logTitleDelete'),
					details: t('events/messages:logDetails', { user: userMention(message.author.id), channel: channelMention(channel.id) }),
					// A message of images only has no text to show, which the log says instead of leaving it blank:
					content: isNullishOrEmpty(content) && images.length === 0 ? t('events/messages:messageUpdateEmpty') : (content ?? ''),
					images,
					footer: t('events/messages:logFooter', { userId: message.author.id, messageId: message.id }),
					buttons: getMessageLogButtons(t, { userId: message.author.id, guildId: guild.id, channelId: channel.id, messageId: message.id })
				});
			}
		});
	}

	private onCondition(message: Message | null, channel: GuildTextBasedChannel, settings: ReadonlyGuildData) {
		// The bots are not logged, there is no setting to include them:
		if (message?.author.bot) return false;
		// The messages that are not cached are not logged, there is no setting to allow them:
		if (isNullish(message)) return false;
		// If the channel or its parent is in the ignored messages array, return false
		if (settings.logsIgnoreMessages.some((id) => id === channel.id || channel.parentId === id)) return false;
		// If the channel or its parent is in the ignoredAll array, return false
		if (settings.logsIgnoreAll.some((id) => id === channel.id || channel.parentId === id)) return false;
		// All checks passed, return true
		return true;
	}
}
