import { isWebhookMessage } from '#common';
import { readSettings } from '#lib/database';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { fetchGuildT } from '#lib/moderation/common';
import { Colors } from '#utils/constants';
import { getMessageLogButtons } from '#lib/moderation/logs/messageButtons';
import { createEventLogMessage, getLogger, getMessageUpdateContent } from '#utils/functions';
import { channelMention, userMention } from '@discordjs/formatters';
import { isNullish } from '@sapphire/utilities';
import { isNsfwChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { Message, User } from '@wolfstar/plugin-gateway';
import type { GuildDataKey, ReadonlyGuildData } from 'wolfstar-database';

@RegisterAsDispatchListener('messageUpdate')
export class UserListener extends EventGatewayListener<'messageUpdate'> {
	public async run(cachedMessage: Message | null, message: Message) {
		if (!message.guildId) return;

		const guild = await this.container.gatewayClient.guilds.resolve(message.guildId);
		if (!guild) return;

		const channel = (await this.container.gatewayClient.channels.resolve(message.channelId)) as GuildTextBasedChannel | null;
		if (!channel) return;

		const oldContent = cachedMessage?.content;
		const currentContent = message.content ?? '';
		if ((cachedMessage && cachedMessage.content === currentContent) || isWebhookMessage(message)) return;

		const key: GuildDataKey = isNsfwChannel(channel) ? 'logsMessageUpdateNsfw' : 'logsMessageUpdate';
		const settings = await readSettings(guild);
		const logger = await getLogger(guild);
		await logger.send({
			key,
			channelId: settings[key],
			condition: () => this.onCondition(cachedMessage, channel, message.author, settings),
			makeMessage: async () => {
				// The condition aborts the log of a message that is not cached:
				if (isNullish(cachedMessage)) return null;

				const t = await fetchGuildT(guild);
				const log = createEventLogMessage({
					color: Colors.Amber,
					title: t('events/messages:logTitleUpdate'),
					details: t('events/messages:logDetails', { user: userMention(message.author.id), channel: channelMention(channel.id) }),
					content: getMessageUpdateContent(settings.logsMessageUpdateStyle, t, oldContent!, currentContent),
					footer: t('events/messages:logFooter', { userId: message.author.id, messageId: message.id }),
					buttons: getMessageLogButtons(t, { userId: message.author.id, guildId: guild.id, channelId: channel.id, messageId: message.id })
				});
				// The log is typed as a constant, whose allowed mentions are read-only:
				return { ...log, allowed_mentions: { parse: [] } };
			}
		});
	}

	private onCondition(cachedMessage: Message | null, channel: GuildTextBasedChannel, author: User, settings: ReadonlyGuildData) {
		// The bots are not logged, there is no setting to include them:
		if (author.bot) return false;
		// The messages that are not cached are not logged, there is no setting to allow them:
		if (isNullish(cachedMessage)) return false;
		// If the channel or its parent is in the ignored messages array, return false
		if (settings.logsIgnoreMessages.some((id) => id === channel.id || channel.parentId === id)) return false;
		// If the channel or its parent is in the ignoredAll array, return false
		if (settings.logsIgnoreAll.some((id) => id === channel.id || channel.parentId === id)) return false;
		// All checks passed, return true
		return true;
	}
}
