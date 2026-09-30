import { GuildSettings, readSettings } from '#lib/database';
import { Events } from '#lib/types/Enums';
import { Colors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import { GuildMember, MessageEmbed } from 'discord.js';

@ApplyOptions<ListenerOptions>({ event: Events.NotMutedMemberAdd })
export class UserListener extends Listener {
	public async run(member: GuildMember) {
		const key = GuildSettings.Channels.Logs.MemberAdd;
		const [logChannelId, t] = await readSettings(member, (settings) => [settings[key], settings.getLanguage()]);
		if (isNullish(logChannelId)) return;

		this.container.gatewayClient.emit(Events.GuildMessageLog, member.guild, logChannelId, key, () =>
			new MessageEmbed()
				.setColor(Colors.Green)
				.setAuthor({
					name: `${member.user.tag} (${member.user.id})`,
					iconURL: member.user.displayAvatarURL({ size: 128, format: 'png', dynamic: true })
				})
				.setDescription(
					t('events/guilds-members:guildMemberAddDescription', {
						mention: member.toString(),
						time: Date.now() - member.user.createdTimestamp
					})
				)
				.setFooter({ text: t('events/guilds-members:guildMemberAdd') })
				.setTimestamp()
		);
	}
}
