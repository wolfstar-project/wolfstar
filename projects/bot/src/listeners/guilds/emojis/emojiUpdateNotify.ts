import { readSettings } from '#lib/database';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { differenceArray } from '#common/comparators';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildEmoji } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('emojiUpdate')
export class UserListener extends EventGatewayListener<'emojiUpdate'> {
	public async run(previous: GuildEmoji, next: GuildEmoji) {
		const settings = await readSettings(next);
		const logger = await getLogger(next);
		await logger.send({
			key: 'logsEmojiUpdate',
			channelId: settings.logsEmojiUpdate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes: string[] = [...this.differenceEmoji(t, previous, next)];
				if (changes.length === 0) return null;

				return new EmbedBuilder()
					.setColor(Colors.Yellow)
					.setThumbnail(next.imageURL({ size: 256 }))
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:emojiUpdate') })
					.setTimestamp();
			}
		});
	}

	private *differenceEmoji(t: Translator, previous: GuildEmoji, next: GuildEmoji) {
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

		// The emoji holds the IDs of its roles, which is all the original read from the cache of roles:
		const modified = differenceArray(previous.roleIds, next.roleIds);
		if (modified.added.length !== 0) {
			const values = modified.added.map((id) => `<@&${id}>`);
			yield t('events/guilds-logs:emojiUpdateRolesAdded', { values, count: values.length });
		}

		if (modified.removed.length !== 0) {
			const values = modified.removed.map((id) => `<@&${id}>`);
			yield t('events/guilds-logs:emojiUpdateRolesRemoved', { values, count: values.length });
		}
	}
}
