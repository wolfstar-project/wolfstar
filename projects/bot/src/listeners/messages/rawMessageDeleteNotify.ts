import { readSettings } from '#lib/database';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { fetchGuildT } from '#lib/moderation/common';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { getContent, getFullEmbedAuthor, getImages, setMultipleEmbedImages } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { cutText, isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { isNsfwChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Message } from '@wolfstar/plugin-gateway';
import type { GatewayMessageDeleteDispatchData } from 'discord-api-types/v10';
import type { GuildDataKey, ReadonlyGuildData } from 'wolfstar-database';

@RegisterAsGatewayListener('messageDelete')
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
				const embed = new EmbedBuilder()
					.setColor(Colors.Red)
					.setTimestamp()
					.setAuthor(getFullEmbedAuthor(message.author, message.url))
					.setFooter({ text: t('events/messages:messageDelete', { channel: `#${channel.name}` }) });

				const content = getContent(message);
				if (!isNullishOrEmpty(content)) embed.setDescription(cutText(content, 1900));

				return setMultipleEmbedImages(embed, getImages(message));
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
