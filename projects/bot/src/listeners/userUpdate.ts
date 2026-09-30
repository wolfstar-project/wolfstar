import { GuildSettings, readSettings } from '#lib/database';
import type { CustomGet } from '#lib/types';
import { Events } from '#lib/types/Enums';
import { filter, map } from '#common';
import { Colors } from '#utils/constants';
import { Listener } from '@sapphire/framework';
import { Guild, MessageEmbed, User } from 'discord.js';
import type { TFunction } from 'i18next';

export class UserListener extends Listener {
	public async run(previous: User, user: User) {
		const prevUsername = previous.username;
		const nextUserName = user.username;
		if (prevUsername === nextUserName) return;

		const promises = [
			...map(
				filter(this.container.gatewayClient.guilds.cache.values(), (guild) => guild.members.cache.has(user.id)),
				(guild) => this.processGuild(guild, user, prevUsername, nextUserName)
			)
		];
		if (promises.length) await Promise.all(promises);
	}

	private async processGuild(guild: Guild, user: User, previous: string, next: string) {
		const [logChannelId, language] = await readSettings(guild, (settings) => [
			settings[GuildSettings.Channels.Logs.MemberUserNameUpdate],
			settings.getLanguage()
		]);

		if (logChannelId) {
			// Send the Username log
			this.container.gatewayClient.emit(Events.GuildMessageLog, guild, logChannelId, GuildSettings.Channels.Logs.MemberUserNameUpdate, () =>
				this.buildEmbed(user, language, this.getNameDescription(language, previous, next), 'events/guilds-members:usernameUpdate')
			);
		}
	}

	private getNameDescription(t: TFunction, previousName: string | null, nextName: string | null) {
		const previous =
			previousName === null ? 'events/guilds-members:nameUpdatePreviousWasNotSet' : 'events/guilds-members:nameUpdatePreviousWasSet';
		const next = nextName === null ? 'events/guilds-members:nameUpdateNextWasNotSet' : 'events/guilds-members:nameUpdateNextWasSet';
		return [t(previous, { previousName }), t(next, { nextName })].join('\n');
	}

	private buildEmbed(user: User, t: TFunction, description: string, footerKey: CustomGet<string, string>) {
		return new MessageEmbed()
			.setColor(Colors.Yellow)
			.setAuthor({ name: `${user.tag} (${user.id})`, iconURL: user.displayAvatarURL({ size: 128, format: 'png', dynamic: true }) })
			.setDescription(description)
			.setFooter({ text: t(footerKey) })
			.setTimestamp();
	}
}
