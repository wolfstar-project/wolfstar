import { GuildSettings, readSettings, writeSettings } from '#lib/database';
import { Colors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import { GuildEmoji, MessageEmbed, TextChannel } from 'discord.js';
import type { TFunction } from 'i18next';

@ApplyOptions<ListenerOptions>({ event: Events.GuildEmojiCreate })
export class UserListener extends Listener<typeof Events.GuildEmojiCreate> {
	public async run(next: GuildEmoji) {
		const [channelId, t] = await readSettings(next.guild, (settings) => [
			settings[GuildSettings.Channels.Logs.EmojiCreate],
			settings.getLanguage()
		]);
		if (isNullish(channelId)) return;

		const channel = next.guild.channels.cache.get(channelId) as TextChannel | undefined;
		if (channel === undefined) {
			await writeSettings(next.guild, [[GuildSettings.Channels.Logs.EmojiCreate, null]]);
			return;
		}

		const changes: string[] = [...this.getEmojiInformation(t, next)];
		const embed = new MessageEmbed()
			.setColor(Colors.Green)
			.setThumbnail(next.url)
			.setAuthor({ name: `${next.name} (${next.id})`, iconURL: channel.guild.iconURL({ size: 64, format: 'png', dynamic: true }) ?? undefined })
			.setDescription(changes.join('\n'))
			.setFooter({ text: t('events/guilds-logs:emojiCreate') })
			.setTimestamp();
		await channel.send({ embeds: [embed] });
	}

	private *getEmojiInformation(t: TFunction, next: GuildEmoji) {
		if (next.animated) yield t('events/guilds-logs:emojiCreateAnimated');
		if (!next.available) yield t('events/guilds-logs:emojiCreateUnAvailable');
		if (next.managed) yield t('events/guilds-logs:emojiCreateManaged');
		if (next.requiresColons) yield t('events/guilds-logs:emojiCreateRequiresColons');

		const roles = next.roles.cache;
		if (roles.size !== 0) {
			const values = [...next.roles.cache.values()].map((role) => role.toString());
			yield t('events/guilds-logs:emojiCreateRoles', { values, count: values.length });
		}
	}
}
