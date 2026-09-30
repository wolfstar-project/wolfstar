import { GuildSettings, readSettings, writeSettings } from '#lib/database';
import { toPermissionsArray } from '#utils/bits';
import { differenceBitField } from '#common/comparators';
import { Colors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import { MessageEmbed, Role, TextChannel } from 'discord.js';
import type { TFunction } from 'i18next';

@ApplyOptions<ListenerOptions>({ event: Events.GuildRoleUpdate })
export class UserListener extends Listener<typeof Events.GuildRoleUpdate> {
	public async run(previous: Role, next: Role) {
		const [channelId, t] = await readSettings(next, (settings) => [settings[GuildSettings.Channels.Logs.RoleUpdate], settings.getLanguage()]);
		if (isNullish(channelId)) return;

		const channel = next.guild.channels.cache.get(channelId) as TextChannel | undefined;
		if (channel === undefined) {
			await writeSettings(next, [[GuildSettings.Channels.Logs.RoleUpdate, null]]);
			return;
		}

		const changes: string[] = [...this.differenceRole(t, previous, next)];
		if (changes.length === 0) return;

		const embed = new MessageEmbed()
			.setColor(Colors.Yellow)
			.setAuthor({ name: `${next.name} (${next.id})`, iconURL: channel.guild.iconURL({ size: 64, format: 'png', dynamic: true }) ?? undefined })
			.setDescription(changes.join('\n'))
			.setFooter({ text: t('events/guilds-logs:roleUpdate') })
			.setTimestamp();
		await channel.send({ embeds: [embed] });
	}

	private *differenceRole(t: TFunction, previous: Role, next: Role) {
		const [no, yes] = [t('globals:no'), t('globals:yes')];

		if (previous.color !== next.color) {
			yield t('events/guilds-logs:roleUpdateColor', {
				previous: previous.hexColor,
				next: next.hexColor
			});
		}

		if (previous.hoist !== next.hoist) {
			yield t('events/guilds-logs:roleUpdateHoist', {
				previous: previous.hoist ? yes : no,
				next: next.hoist ? yes : no
			});
		}

		if (previous.mentionable !== next.mentionable) {
			yield t('events/guilds-logs:roleUpdateMentionable', {
				previous: previous.mentionable ? yes : no,
				next: next.mentionable ? yes : no
			});
		}

		if (previous.name !== next.name) {
			yield t('events/guilds-logs:roleUpdateName', {
				previous: previous.name,
				next: next.name
			});
		}

		if (previous.permissions.bitfield !== next.permissions.bitfield) {
			const modified = differenceBitField(previous.permissions.bitfield, next.permissions.bitfield);
			if (modified.added) {
				const values = toPermissionsArray(modified.added).map((key) => t(`permissions:${key}`));
				yield t('events/guilds-logs:roleUpdatePermissionsAdded', { values, count: values.length });
			}

			if (modified.removed) {
				const values = toPermissionsArray(modified.removed).map((key) => t(`permissions:${key}`));
				yield t('events/guilds-logs:roleUpdatePermissionsRemoved', { values, count: values.length });
			}
		}

		if (previous.position !== next.position) {
			yield t('events/guilds-logs:roleUpdatePosition', {
				previous: previous.position,
				next: next.position
			});
		}
	}
}
