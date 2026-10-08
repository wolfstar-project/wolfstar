import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes, seconds } from '#common';
import { Colors } from '#utils/constants';
import { channelMention, EmbedBuilder, time, TimestampStyles } from '@discordjs/builders';
import { DiscordSnowflake } from '@sapphire/snowflake';
import { cutText } from '@sapphire/utilities';
import { container, type TransformedArguments } from '@wolfstar/http-framework';
import type { AnyChannel } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';

const Root = 'commands/tools';

/**
 * The channel types that have a name in the translations, `GuildNews` and the other aliases of the enum are the same
 * numbers as these.
 */
const TypeNames: Partial<Record<ChannelType, string>> = {
	[ChannelType.GuildText]: 'GuildText',
	[ChannelType.GuildVoice]: 'GuildVoice',
	[ChannelType.GuildCategory]: 'GuildCategory',
	[ChannelType.GuildAnnouncement]: 'GuildAnnouncement',
	[ChannelType.AnnouncementThread]: 'AnnouncementThread',
	[ChannelType.PublicThread]: 'PublicThread',
	[ChannelType.PrivateThread]: 'PrivateThread',
	[ChannelType.GuildStageVoice]: 'GuildStageVoice',
	[ChannelType.GuildForum]: 'GuildForum',
	[ChannelType.GuildMedia]: 'GuildMedia'
};

/**
 * `/whois channel`, see the `whois` parent command. Displays a channel of the server, or the one it was run in.
 *
 * @remarks A channel the author cannot see is not displayed, since its name and its topic would tell them what they cannot
 * read. The default channel is the one the command was run in, which the author sees by definition.
 */
@RegisterAsSubcommand('whois', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:whoisSubcommandChannel`) //
		.addChannelOption((option) => applyLocalizedBuilder(option, `${Root}:whoisOptionsChannel`).setRequired(false))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);
		const fail = (key: TranslationKey) => interaction.reply({ content: translateKey(t, key), flags: MessageFlags.Ephemeral });

		const { channel } = options;
		if (channel !== undefined && (BigInt(channel.permissions ?? 0) & PermissionFlagsBits.ViewChannel) === 0n) {
			return fail(`${Root}:whoisChannelNoAccess`);
		}

		// The channel comes from the gateway cache, which Discord keeps up to date, and not from a request of its own:
		const fetched = await resolveOnErrorCodes(
			container.gatewayClient.channels.fetch(channel?.id ?? interaction.channel.id),
			RESTJSONErrorCodes.UnknownChannel
		);
		if (fetched === null || !('guildId' in fetched) || fetched.guildId !== interaction.guildId) return fail(`${Root}:whoisChannelUnknown`);

		return interaction.reply({ embeds: [this.getEmbed(t, fetched).toJSON()], flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}

	private getEmbed(t: TFunction, channel: AnyChannel) {
		const created = seconds.fromMilliseconds(Number(DiscordSnowflake.timestampFrom(channel.id)));
		const lines = [
			translateKey(t, `${Root}:whoisChannelType`, {
				type: translateKey(t, `${Root}:whoisChannelTypes.${TypeNames[channel.type] ?? 'Unknown'}` as TranslationKey)
			}),
			translateKey(t, `${Root}:whoisChannelCreated`, {
				date: time(created, TimestampStyles.ShortDateTime),
				relative: time(created, TimestampStyles.RelativeTime)
			})
		];

		if ('parentId' in channel && channel.parentId)
			lines.push(translateKey(t, `${Root}:whoisChannelCategory`, { category: channelMention(channel.parentId) }));
		if ('position' in channel) lines.push(translateKey(t, `${Root}:whoisChannelPosition`, { position: channel.position + 1 }));
		if ('nsfw' in channel && channel.nsfw) lines.push(translateKey(t, `${Root}:whoisChannelNsfw`));
		if ('rateLimitPerUser' in channel && channel.rateLimitPerUser) {
			lines.push(
				translateKey(t, `${Root}:whoisChannelSlowmode`, {
					value: translateKey(t, 'globals:durationValue', { value: seconds(channel.rateLimitPerUser) })
				})
			);
		}

		if ('bitrate' in channel && channel.bitrate)
			lines.push(translateKey(t, `${Root}:whoisChannelBitrate`, { value: Math.round(channel.bitrate / 1000) }));
		if ('userLimit' in channel && channel.userLimit) lines.push(translateKey(t, `${Root}:whoisChannelUserLimit`, { value: channel.userLimit }));
		if ('archived' in channel && channel.archived) lines.push(translateKey(t, `${Root}:whoisChannelArchived`));
		if ('locked' in channel && channel.locked) lines.push(translateKey(t, `${Root}:whoisChannelLocked`));

		if ('permissionOverwrites' in channel) {
			const overwrites = channel.permissionOverwrites.cache.length;
			if (overwrites > 0) lines.push(translateKey(t, `${Root}:whoisChannelOverwrites`, { count: overwrites }));
		}

		const name = 'name' in channel && channel.name ? channel.name : channel.id;
		const embed = new EmbedBuilder()
			.setColor(Colors.White)
			.setTitle(cutText(name, 256))
			.setDescription(`${channelMention(channel.id)}\n${lines.join('\n')}`)
			.setFooter({ text: translateKey(t, `${Root}:whoisChannelFooter`, { id: channel.id }) });

		if ('topic' in channel && channel.topic)
			embed.addFields({ name: translateKey(t, `${Root}:whoisChannelTopic`), value: cutText(channel.topic, 1024) });
		return embed;
	}
}

interface Options {
	channel?: TransformedArguments.Channel;
}
