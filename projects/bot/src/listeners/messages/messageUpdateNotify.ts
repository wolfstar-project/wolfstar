import { GuildSettings, readSettings } from '#lib/database';
import { Events } from '#lib/types/Enums';
import { Colors } from '#utils/constants';
import { escapeMarkdown } from '#utils/External/escapeMarkdown';
import { createLogMessage } from '#utils/functions';
import { ApplyOptions } from '@sapphire/decorators';
import { isNsfwChannel } from '@sapphire/discord.js-utilities';
import { Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import { diffWordsWithSpace } from 'diff';
import type { Message } from 'discord.js';

@ApplyOptions<ListenerOptions>({ event: Events.MessageUpdate })
export class UserListener extends Listener {
	public async run(old: Message, message: Message) {
		if (!message.inGuild() || old.content === message.content || message.author.bot) return;

		const key = GuildSettings.Channels.Logs[isNsfwChannel(message.channel) ? 'MessageUpdateNsfw' : 'MessageUpdate'];
		const [ignoredChannels, logChannelId, ignoredEdits, ignoredAll, t] = await readSettings(message.guild, (settings) => [
			settings[GuildSettings.Messages.IgnoreChannels],
			settings[key],
			settings[GuildSettings.Channels.Ignore.MessageEdit],
			settings[GuildSettings.Channels.Ignore.All],
			settings.getLanguage()
		]);

		if (isNullish(logChannelId)) return;
		if (ignoredChannels.includes(message.channel.id)) return;
		if (ignoredEdits.some((id) => id === message.channel.id || message.channel.parentId === id)) return;
		if (ignoredAll.some((id) => id === message.channel.id || message.channel.parentId === id)) return;

		this.container.gatewayClient.emit(Events.GuildMessageLog, message.guild, logChannelId, key, () =>
			createLogMessage({
				color: Colors.Amber,
				author: message.author,
				content: diffWordsWithSpace(escapeMarkdown(old.content), escapeMarkdown(message.content))
					.map((result) => (result.added ? `**${result.value}**` : result.removed ? `~~${result.value}~~` : result.value))
					.join(' '),
				footer: t('events/messages:messageUpdate', { channel: `#${message.channel.name}` })
			})
		);
	}
}
