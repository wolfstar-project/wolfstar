import { readSettings } from '#lib/database';
import { createTranslator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildEmoji } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('emojiDelete')
export class UserListener extends EventGatewayListener<'emojiDelete'> {
	public async run(next: GuildEmoji) {
		const settings = await readSettings(next);
		const logger = await getLogger(next);
		await logger.send({
			key: 'logsEmojiDelete',
			channelId: settings.logsEmojiDelete,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				return new EmbedBuilder()
					.setColor(Colors.Red)
					.setThumbnail(next.imageURL({ size: 256 }))
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setFooter({ text: t('events/guilds-logs:emojiDelete') })
					.setTimestamp();
			}
		});
	}
}
