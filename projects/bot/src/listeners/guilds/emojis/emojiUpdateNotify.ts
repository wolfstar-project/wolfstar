import { GuildSettings, readSettings, writeSettings } from '#lib/database';
import { differenceMap } from '#common/comparators';
import { Colors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import { GuildEmoji, MessageEmbed, TextChannel } from 'discord.js';
import type { TFunction } from 'i18next';

@ApplyOptions<ListenerOptions>({ event: Events.GuildEmojiUpdate })
export class UserListener extends Listener<typeof Events.GuildEmojiUpdate> {
	public async run(previous: GuildEmoji, next: GuildEmoji) {
		const [channelId, t] = await readSettings(next.guild, (settings) => [
			settings[GuildSettings.Channels.Logs.EmojiUpdate],
			settings.getLanguage()
		]);
		if (isNullish(channelId)) return;

		const channel = next.guild.channels.cache.get(channelId) as TextChannel | undefined;
		if (channel === undefined) {
			await writeSettings(next.guild, [[GuildSettings.Channels.Logs.EmojiUpdate, null]]);
			return;
		}

		const changes: string[] = [...this.differenceEmoji(t, previous, next)];
		if (changes.length === 0) return;

		const embed = new MessageEmbed()
			.setColor(Colors.Yellow)
			.setThumbnail(next.url)
			.setAuthor({ name: `${next.name} (${next.id})`, iconURL: channel.guild.iconURL({ size: 64, format: 'png', dynamic: true }) ?? undefined })
			.setDescription(changes.join('\n'))
			.setFooter({ text: t('events/guilds-logs:emojiUpdate') })
			.setTimestamp();
		await channel.send({ embeds: [embed] });
	}

	private *differenceEmoji(t: TFunction, previous: GuildEmoji, next: GuildEmoji) {
		const [no, yes] = [t('globals:no'), t('globals:yes')];

		if (previous.animated !== next.animated) {
			yield t('events/guilds-logs:emojiUpdateAnimated', {
				previous: previous.animated ? yes : no,
				next: next.animated ? yes : no
			});
		}

		if (previous.available !== next.available) {
			yield t('events/guilds-logs:emojiUpdateAvailable', {
				previous: previous.available ? yes : no,
				next: next.available ? yes : no
			});
		}

		if (previous.managed !== next.managed) {
			yield t('events/guilds-logs:emojiUpdateManaged', {
				previous: previous.managed ? yes : no,
				next: next.managed ? yes : no
			});
		}

		if (previous.name !== next.name) {
			yield t('events/guilds-logs:emojiUpdateName', {
				previous: previous.name,
				next: next.name
			});
		}

		if (previous.requiresColons !== next.requiresColons) {
			yield t('events/guilds-logs:emojiUpdateRequiresColons', {
				previous: previous.requiresColons ? yes : no,
				next: next.requiresColons ? yes : no
			});
		}

		const modified = differenceMap(previous.roles.cache, next.roles.cache);
		if (modified.added.size !== 0) {
			const values = [...modified.added.keys()].map((id) => `<@&${id}>`);
			yield t('events/guilds-logs:emojiUpdateRolesAdded', { values, count: values.length });
		}

		if (modified.removed.size !== 0) {
			const values = [...modified.removed.keys()].map((id) => `<@&${id}>`);
			yield t('events/guilds-logs:emojiUpdateRolesRemoved', { values, count: values.length });
		}
	}
}
