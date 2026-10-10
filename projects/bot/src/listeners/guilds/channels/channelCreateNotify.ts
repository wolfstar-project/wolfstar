import { readSettings } from '#lib/database';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { toPermissionsArray } from '#utils/bits';
import { seconds } from '#common';
import { Colors, LongWidthSpace } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { isGuildBasedChannel, isNsfwChannel, isThreadChannel } from '@wolfstar/http-framework-utilities/gateway';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type {
	AnnouncementChannel,
	AnyChannel,
	NonThreadGuildBasedChannel,
	PermissionOverwrites,
	StageChannel,
	TextChannel,
	VoiceChannel
} from '@wolfstar/plugin-gateway';
import { ChannelType, OverwriteType } from 'discord-api-types/v10';

@RegisterAsGatewayListener('channelCreate')
export class UserListener extends EventGatewayListener<'channelCreate'> {
	public async run(created: AnyChannel) {
		// The event is also emitted for the channels that are not of a guild, the threads have their own event:
		if (!isGuildBasedChannel(created) || isThreadChannel(created)) return;

		const channel = created as NonThreadGuildBasedChannel;
		const settings = await readSettings(channel.guildId);
		const logger = await getLogger(channel.guildId);
		await logger.send({
			key: 'logsChannelCreate',
			channelId: settings.logsChannelCreate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes: string[] = [...this.getChannelInformation(t, channel)];
				return new EmbedBuilder()
					.setColor(Colors.Green)
					.setAuthor({
						name: `${channel.name} (${channel.id})`,
						iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined
					})
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:channelCreate') })
					.setTimestamp();
			}
		});
	}

	private *getChannelInformation(t: Translator, channel: NonThreadGuildBasedChannel) {
		yield* this.getGuildChannelInformation(t, channel);

		switch (channel.type) {
			case ChannelType.GuildText:
				yield* this.getTextChannelInformation(t, channel as TextChannel);
				break;
			case ChannelType.GuildStageVoice:
			case ChannelType.GuildVoice:
				yield* this.getVoiceChannelInformation(t, channel as StageChannel | VoiceChannel);
				break;
			case ChannelType.GuildAnnouncement:
				yield* this.getNewsChannelInformation(t, channel as AnnouncementChannel);
				break;
			default:
			// No Op
		}

		yield* this.getChannelPermissionOverwrites(t, channel);
	}

	private *getGuildChannelInformation(t: Translator, channel: NonThreadGuildBasedChannel) {
		if ('parentId' in channel && channel.parentId) yield t('events/guilds-logs:channelCreateParent', { value: `<#${channel.parentId}>` });
		yield t('events/guilds-logs:channelCreatePosition', { value: channel.position });
	}

	private *getChannelPermissionOverwrites(t: Translator, channel: NonThreadGuildBasedChannel) {
		for (const overwrite of channel.permissionOverwrites.cache) {
			const allow = overwrite.allow.bitField;
			const deny = overwrite.deny.bitField;
			if (allow === 0n && deny === 0n) continue;

			const mention = this.displayMention(overwrite, channel.guildId);
			yield t('events/guilds-logs:channelCreatePermissionsTitle', { value: mention });
			if (allow !== 0n) {
				const values = toPermissionsArray(allow).map((value) => t(`permissions:${value}` as TranslationKey));
				yield LongWidthSpace + t('events/guilds-logs:channelCreatePermissionsAllow', { values, count: values.length });
			}

			if (deny !== 0n) {
				const values = toPermissionsArray(deny).map((value) => t(`permissions:${value}` as TranslationKey));
				yield LongWidthSpace + t('events/guilds-logs:channelCreatePermissionsDeny', { values, count: values.length });
			}
		}
	}

	private *getTextChannelInformation(t: Translator, channel: TextChannel) {
		if (isNsfwChannel(channel)) yield this.displayNsfw(t);
		if (channel.topic) yield this.displayTopic(t, channel.topic);
		if (channel.rateLimitPerUser) yield this.displayRateLimitPerUser(t, channel.rateLimitPerUser);
	}

	private *getVoiceChannelInformation(t: Translator, channel: StageChannel | VoiceChannel) {
		yield this.displayBitrate(t, channel.bitrate);
		if (channel.userLimit !== 0) yield this.displayUserLimit(t, channel.userLimit);
	}

	private *getNewsChannelInformation(t: Translator, channel: AnnouncementChannel) {
		if (isNsfwChannel(channel)) yield this.displayNsfw(t);
		if (channel.topic) yield this.displayTopic(t, channel.topic);
	}

	private displayNsfw(t: Translator) {
		return t('events/guilds-logs:channelCreateNsfw');
	}

	private displayTopic(t: Translator, value: string) {
		return t('events/guilds-logs:channelCreateTopic', { value });
	}

	private displayRateLimitPerUser(t: Translator, value: number) {
		return t('events/guilds-logs:channelCreateRateLimit', { value: seconds(value) });
	}

	private displayBitrate(t: Translator, value: number) {
		return t('events/guilds-logs:channelCreateBitrate', { value: value / 1000 });
	}

	private displayUserLimit(t: Translator, value: number) {
		return t('events/guilds-logs:channelCreateUserLimit', { value });
	}

	private displayMention(permissions: PermissionOverwrites, guildId: string) {
		if (permissions.type === OverwriteType.Member) return `<@${permissions.id}>`;
		if (permissions.id === guildId) return '@everyone';
		return `<@&${permissions.id}>`;
	}
}
