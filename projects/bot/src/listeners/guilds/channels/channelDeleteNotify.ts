import { readSettings } from '#lib/database';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { isGuildBasedChannel, isThreadChannel } from '@wolfstar/http-framework-utilities/gateway';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { AnyChannel, NonThreadGuildBasedChannel } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('channelDelete')
export class UserListener extends EventGatewayListener<'channelDelete'> {
	public async run(deleted: AnyChannel) {
		// The event is also emitted for the channels that are not of a guild, the threads have their own event:
		if (!isGuildBasedChannel(deleted) || isThreadChannel(deleted)) return;

		const channel = deleted as NonThreadGuildBasedChannel;
		const settings = await readSettings(channel.guildId);
		const logger = await getLogger(channel.guildId);
		await logger.send({
			key: 'logsChannelDelete',
			channelId: settings.logsChannelDelete,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes = [...this.getChannelInformation(t, channel)];
				return new EmbedBuilder()
					.setColor(Colors.Red)
					.setAuthor({
						name: `${channel.name} (${channel.id})`,
						iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined
					})
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:channelDelete') })
					.setTimestamp();
			}
		});
	}

	private *getChannelInformation(t: Translator, channel: NonThreadGuildBasedChannel) {
		if ('parentId' in channel && channel.parentId) yield t('events/guilds-logs:channelCreateParent', { value: `<#${channel.parentId}>` });
	}
}
