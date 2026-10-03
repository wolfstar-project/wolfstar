import { GuildSettings, readSettings } from '#lib/database';
import { Events } from '#lib/types/Enums';
import { Colors } from '#utils/constants';
import { getModeration } from '#utils/functions';
import { TypeCodes } from '#utils/moderationConstants';
import { getDisplayAvatar } from '#utils/util';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import type { GatewayGuildMemberRemoveDispatch } from 'discord-api-types/v9';
import { Guild, GuildMember, MessageEmbed } from 'discord.js';

@ApplyOptions<ListenerOptions>({ event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatch['d']) {
		const key = GuildSettings.Channels.Logs.MemberRemove;
		const [logChannelId, t] = await readSettings(guild, (settings) => [settings[key], settings.getLanguage()]);
		if (isNullish(logChannelId)) return;

		const isModerationAction = await this.isModerationAction(guild, user);

		const footer = isModerationAction.kicked
			? t('events/guilds-members:guildMemberKicked')
			: isModerationAction.banned
				? t('events/guilds-members:guildMemberBanned')
				: isModerationAction.softbanned
					? t('events/guilds-members:guildMemberSoftBanned')
					: t('events/guilds-members:guildMemberRemove');

		const time = this.processJoinedTimestamp(member);
		this.container.gatewayClient.emit(Events.GuildMessageLog, guild, logChannelId, key, () =>
			new MessageEmbed()
				.setColor(Colors.Red)
				.setAuthor({ name: `${user.username}#${user.discriminator} (${user.id})`, iconURL: getDisplayAvatar(user.id, user) })
				.setDescription(
					t(
						time === -1
							? 'events/guilds-members:guildMemberRemoveDescription'
							: 'events/guilds-members:guildMemberRemoveDescriptionWithJoinedAt',
						{
							mention: `<@${user.id}>`,
							time
						}
					)
				)
				.setFooter({ text: footer })
				.setTimestamp()
		);
	}

	private async isModerationAction(guild: Guild, user: GatewayGuildMemberRemoveDispatch['d']['user']): Promise<IsModerationAction> {
		const moderation = await getModeration(guild);
		await moderation.waitLock();

		const latestLogForUser = moderation.getLatestLogForUser(user.id);

		if (latestLogForUser === null) {
			return {
				kicked: false,
				banned: false,
				softbanned: false
			};
		}

		return {
			kicked: latestLogForUser.isType(TypeCodes.Kick),
			banned: latestLogForUser.isType(TypeCodes.Ban),
			softbanned: latestLogForUser.isType(TypeCodes.SoftBan)
		};
	}

	private processJoinedTimestamp(member: GuildMember | null) {
		if (member === null) return -1;
		if (member.joinedTimestamp === null) return -1;
		return Date.now() - member.joinedTimestamp;
	}
}

interface IsModerationAction {
	readonly kicked: boolean;
	readonly banned: boolean;
	readonly softbanned: boolean;
}
