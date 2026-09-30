import { GuildSettings, readSettings, writeSettings } from '#lib/database';
import { toPermissionsArray } from '#utils/bits';
import { Colors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import { MessageEmbed, Role, TextChannel } from 'discord.js';
import type { TFunction } from 'i18next';

@ApplyOptions<ListenerOptions>({ event: Events.GuildRoleCreate })
export class UserListener extends Listener<typeof Events.GuildRoleCreate> {
	public async run(next: Role) {
		const [channelId, t] = await readSettings(next, (settings) => [settings[GuildSettings.Channels.Logs.RoleCreate], settings.getLanguage()]);
		if (isNullish(channelId)) return;

		const channel = next.guild.channels.cache.get(channelId) as TextChannel | undefined;
		if (channel === undefined) {
			await writeSettings(next, [[GuildSettings.Channels.Logs.RoleCreate, null]]);
			return;
		}

		const changes: string[] = [...this.getRoleInformation(t, next)];
		const embed = new MessageEmbed()
			.setColor(Colors.Green)
			.setAuthor({ name: `${next.name} (${next.id})`, iconURL: channel.guild.iconURL({ size: 64, format: 'png', dynamic: true }) ?? undefined })
			.setDescription(changes.join('\n'))
			.setFooter({ text: t('events/guilds-logs:roleCreate') })
			.setTimestamp();
		await channel.send({ embeds: [embed] });
	}

	private *getRoleInformation(t: TFunction, role: Role) {
		if (role.color !== 0x000000) yield t('events/guilds-logs:roleCreateColor', { value: role.hexColor });
		if (role.hoist) yield t('events/guilds-logs:roleCreateHoist');
		if (role.mentionable) yield t('events/guilds-logs:roleCreateMentionable');

		if (role.permissions.bitfield !== 0n) {
			const values = toPermissionsArray(role.permissions.bitfield).map((key) => t(`permissions:${key}`));
			yield t('events/guilds-logs:roleCreatePermissions', { values, count: values.length });
		}

		yield t('events/guilds-logs:roleCreatePosition', { value: role.position });
	}
}
