import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getCustomEmojiUrl, getEncodedTwemoji, getLogger, getTwemojiUrl } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { inlineCode, messageLink } from '@discordjs/formatters';
import { isNullish } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { GatewayMessageReactionRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Logs the reactions the members remove from the messages, the counterpart of `rawReactionAddNotify`.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawReactionRemove })
export class UserListener extends Listener {
	public async run(channel: GuildTextBasedChannel, data: GatewayMessageReactionRemoveDispatchData) {
		if (isNullish(data.guild_id)) return;

		const settings = await readSettings(data.guild_id);
		const targetChannelId = settings.logsReactionEmojiRemove;
		if (isNullish(targetChannelId) || (!settings.logsReactionEmojiIncludeTwemoji && data.emoji.id === null)) return;

		if (settings.logsIgnoreReactions.some((id) => id === channel.id || channel.parentId === id)) return;
		if (settings.logsIgnoreAll.some((id) => id === channel.id || channel.parentId === id)) return;

		const user = await this.container.gatewayClient.users.fetch(data.user_id);
		if (user.bot) return;

		const { emoji } = data;
		const t = await fetchGuildT({ id: data.guild_id });
		const logger = await getLogger(data.guild_id);
		await logger.send({
			key: 'logsReactionEmojiRemove',
			channelId: targetChannelId,
			makeMessage: () =>
				new EmbedBuilder()
					.setColor(Colors.Red)
					.setAuthor(getFullEmbedAuthor(user))
					.setThumbnail(
						emoji.id === null ? getTwemojiUrl(getEncodedTwemoji(emoji.name!)) : getCustomEmojiUrl(emoji.id, emoji.animated ?? false)
					)
					.setDescription(
						t('events/reactions:reactionRemoveDescription', {
							emoji: emoji.id ? `${emoji.name} (${inlineCode(emoji.id)})` : emoji.name!,
							message: messageLink(data.channel_id, data.message_id, data.guild_id!)
						})
					)
					.setFooter({ text: t('events/reactions:reactionRemoveFooter') })
					.setTimestamp()
		});
	}
}
