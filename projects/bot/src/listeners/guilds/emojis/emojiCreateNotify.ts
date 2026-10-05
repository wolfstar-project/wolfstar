import { readSettings } from '#lib/database';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { roleMention } from '@discordjs/formatters';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildEmoji } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('emojiCreate')
export class UserListener extends EventGatewayListener<'emojiCreate'> {
	public async run(next: GuildEmoji) {
		const settings = await readSettings(next);
		const logger = await getLogger(next);
		await logger.send({
			key: 'logsEmojiCreate',
			channelId: settings.logsEmojiCreate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes: string[] = [...this.getEmojiInformation(t, next)];
				return new EmbedBuilder()
					.setColor(Colors.Green)
					.setThumbnail(next.imageURL({ size: 256 }))
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:emojiCreate') })
					.setTimestamp();
			}
		});
	}

	private *getEmojiInformation(t: Translator, next: GuildEmoji) {
		if (next.animated) yield t('events/guilds-logs:emojiCreateAnimated');
		if (!next.available) yield t('events/guilds-logs:emojiCreateUnAvailable');
		if (next.managed) yield t('events/guilds-logs:emojiCreateManaged');
		if (next.requiresColons) yield t('events/guilds-logs:emojiCreateRequiresColons');

		const roles = next.roleIds;
		if (roles.length !== 0) {
			const values = roles.map((id) => roleMention(id));
			yield t('events/guilds-logs:emojiCreateRoles', { values, count: values.length });
		}
	}
}
