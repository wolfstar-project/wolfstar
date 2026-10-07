import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { seconds } from '#common';
import { getColor, getTag } from '#utils/util';
import { EmbedBuilder, roleMention, time, TimestampStyles } from '@discordjs/builders';
import { container } from '@wolfstar/http-framework';
import type { Guild, Role } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType } from 'discord-api-types/v10';

/**
 * The amount of roles listed in the summary, the rest is collapsed into a "N more" entry.
 */
const RoleLimit = 15;

const ImageOptions = { size: 4096, extension: 'png' } as const;

/**
 * `/whois server`, see the `whois` parent command. Displays the server: its owner, channels, members and images.
 */
@RegisterAsSubcommand('whois', (builder) => applyLocalizedBuilder(builder, 'commands/tools:whoisSubcommandServer'))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const deferred = await interaction.defer();

		const t = getSupportedUserLanguageT(interaction);
		const { gatewayClient } = container;
		const guild = await gatewayClient.guilds.fetch(interaction.guildId);
		const member = await gatewayClient.members.fetch(interaction.guildId, interaction.user.id);
		const color = await getColor({ member });
		const roles = await this.getRoles(guild);

		// The summary and the images are sent as embeds of the same message:
		const embeds = [await this.getSummary(t, guild, roles, color)];
		if (guild.icon) embeds.push(this.getImage(translateKey(t, 'commands/management:guildInfoIcon'), guild.iconURL(ImageOptions)!, color));
		if (guild.banner) embeds.push(this.getImage(translateKey(t, 'commands/management:guildInfoBanner'), guild.bannerURL(ImageOptions)!, color));
		if (guild.splash) embeds.push(this.getImage(translateKey(t, 'commands/management:guildInfoSplash'), guild.splashURL(ImageOptions)!, color));
		if (guild.discoverySplash) {
			const description = translateKey(t, 'commands/management:guildInfoDiscoverySplash');
			embeds.push(this.getImage(description, guild.discoverySplashURL(ImageOptions)!, color));
		}

		return deferred.update({ embeds: embeds.map((embed) => embed.toJSON()) });
	}

	private async getSummary(t: TFunction, guild: Guild, roles: readonly Role[], color: number) {
		const titles = (key: 'CHANNELS' | 'MEMBERS' | 'OTHER') => translateKey(t, `commands/management:guildInfoTitles.${key}` as TranslationKey);

		// `@everyone` is not part of the roles, and neither of the count in the title:
		const roleCount = roles.length;
		return new EmbedBuilder()
			.setColor(color)
			.setThumbnail(guild.iconURL({ size: 256, extension: 'png' }))
			.setTitle(`${guild.name} [${guild.id}]`)
			.addFields(
				{ name: translateKey(t, 'commands/tools:whoisMemberRoles', { count: roleCount }), value: this.getSummaryRoles(t, roles) },
				{ name: titles('MEMBERS'), value: await this.getSummaryMembers(t, guild), inline: true },
				{ name: titles('CHANNELS'), value: await this.getSummaryChannels(t, guild), inline: true },
				{ name: titles('OTHER'), value: this.getSummaryOther(t, guild, roleCount + 1) }
			);
	}

	private getImage(description: string, url: string, color: number) {
		return new EmbedBuilder().setColor(color).setDescription(`${description} [→](${url})`).setImage(url);
	}

	/**
	 * Gets the roles of the guild, the highest first and without `@everyone`.
	 */
	private async getRoles(guild: Guild): Promise<Role[]> {
		const roles = await container.gatewayClient.roles.fetchAll(guild.id);
		return roles.filter((role) => role.id !== guild.id).sort((x, y) => y.position - x.position);
	}

	private getSummaryRoles(t: TFunction, roles: readonly Role[]): string {
		if (roles.length <= RoleLimit) return translateKey(t, 'globals:andListValue', { value: roles.map((role) => roleMention(role.id)) });

		const mentions = roles
			.slice(0, RoleLimit - 1)
			.map((role): string => roleMention(role.id))
			.concat(translateKey(t, 'commands/tools:whoisMemberRoleListAndMore', { count: roles.length - RoleLimit - 1 }));
		return translateKey(t, 'globals:andListValue', { value: mentions });
	}

	private async getSummaryMembers(t: TFunction, guild: Guild): Promise<string> {
		const owner = await container.gatewayClient.users.fetch(guild.ownerId);

		return translateKey(t, 'commands/management:guildInfoMembers', {
			memberCount: guild.memberCount ?? guild.approximateMemberCount ?? 0,
			ownerId: owner.id,
			ownerTag: getTag(owner)
		});
	}

	private async getSummaryChannels(t: TFunction, guild: Guild): Promise<string> {
		let text = 0;
		let voice = 0;
		let categories = 0;
		for (const channel of await guild.channels.fetch()) {
			switch (channel.type) {
				case ChannelType.GuildText:
				case ChannelType.GuildAnnouncement:
					text++;
					break;
				case ChannelType.GuildVoice:
				case ChannelType.GuildStageVoice:
					voice++;
					break;
				case ChannelType.GuildCategory:
					categories++;
					break;
				default:
					break;
			}
		}

		return translateKey(t, 'commands/management:guildInfoChannels', {
			text,
			voice,
			categories,
			afkChannelText: guild.afkChannelId
				? translateKey(t, 'commands/management:guildInfoChannelsAfkChannelText', {
						afkChannel: guild.afkChannelId,
						afkTime: guild.afkTimeout / 60
					})
				: `**${translateKey(t, 'globals:none')}**`
		});
	}

	private getSummaryOther(t: TFunction, guild: Guild, roleCount: number): string {
		return translateKey(t, 'commands/management:guildInfoOther', {
			size: roleCount,
			createdAt: time(seconds.fromMilliseconds(guild.createdTimestamp), TimestampStyles.ShortDateTime),
			verificationLevel: guild.verificationLevel
		});
	}
}
