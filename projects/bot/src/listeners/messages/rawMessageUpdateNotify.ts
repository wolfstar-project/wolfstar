import { readSettings } from '#lib/database';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { fetchGuildT } from '#lib/moderation/common';
import type { Translator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { createLogMessage, getLogger, getMessageUpdateContent } from '#utils/functions';
import { hyperlink, messageLink } from '@discordjs/formatters';
import { isNullish } from '@sapphire/utilities';
import { isNsfwChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Message, User } from '@wolfstar/plugin-gateway';
import type { GuildDataKey, ReadonlyGuildData } from 'wolfstar-database';

@RegisterAsGatewayListener('messageUpdate')
export class UserListener extends EventGatewayListener<'messageUpdate'> {
	public async run(cachedMessage: Message | null, message: Message) {
		if (!message.guildId) return;

		const guild = await this.container.gatewayClient.guilds.resolve(message.guildId);
		if (!guild) return;

		const channel = (await this.container.gatewayClient.channels.resolve(message.channelId)) as GuildTextBasedChannel | null;
		if (!channel) return;

		const oldContent = cachedMessage?.content;
		const currentContent = message.content ?? '';
		if ((cachedMessage && cachedMessage.content === currentContent) || message.webhookId !== null) return;

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
				const log = createLogMessage({
					color: Colors.Amber,
					author: message.author.toJSON(),
					content: getMessageUpdateContent(settings.logsMessageUpdateStyle, t, oldContent!, currentContent),
					footer: this.getFooter(t, guild.id, channel, message.id)
				});
				// The log is typed as a constant, whose allowed mentions are read-only:
				return { ...log, allowed_mentions: { parse: [] } };
			}
		});
	}

	private getFooter(t: Translator, guildId: string, channel: GuildTextBasedChannel, messageId: string) {
		const link = hyperlink(t('events/messages:jumpToContext'), messageLink(channel.id, messageId, guildId));
		return `${t('events/messages:messageUpdate', { channel: `#${channel.name}` })} • ${link}`;
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
