import type { GuildChatInputInteraction, TranslationKey } from '#lib/structures/commands/utils';
import { translateKey } from '#lib/structures/commands/utils';
import { months, resolveOnErrorCodes, seconds } from '#common';
import { Colors, Emojis } from '#utils/constants';
import { addAutomaticFields } from '#utils/functions';
import { PermissionsBits } from '#utils/bits';
import { getTag } from '#utils/util';
import { EmbedBuilder, time, TimestampStyles, userMention, roleMention } from '@discordjs/builders';
import type { GuildMember, User } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';

const KeyPermissions = [
	'BanMembers',
	'KickMembers',
	'ManageChannels',
	'ManageGuildExpressions',
	'ManageGuild',
	'ManageMessages',
	'ManageNicknames',
	'ManageRoles',
	'ManageWebhooks',
	'MentionEveryone'
] as const satisfies readonly (keyof typeof PermissionFlagsBits)[];

const Root = 'commands/tools';

/**
 * `/whois user`, see the `whois` parent command.
 */
@RegisterAsSubcommand('whois', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:whoisSubcommandUser`) //
		.addUserOption((option) => applyLocalizedBuilder(option, `${Root}:whoisOptionsUser`).setRequired(false))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'whois user'>) {
		const deferred = await interaction.defer();

		const t = getSupportedUserLanguageT(interaction);
		const { gatewayClient } = this.container;
		const userId = options.user?.user.id ?? interaction.user.id;
		const user = await gatewayClient.users.fetch(userId);
		const member = await resolveOnErrorCodes(gatewayClient.members.fetch(interaction.guildId, userId), RESTJSONErrorCodes.UnknownMember);

		const embed = member ? await this.member(t, interaction.guildId, user, member) : this.user(t, user);
		return deferred.update({ embeds: [embed.toJSON()] });
	}

	private user(t: TFunction, user: User) {
		const createdAt = seconds.fromMilliseconds(user.createdTimestamp);
		const key = (name: string) => `${Root}:whoisUser${name}` as TranslationKey;

		return new EmbedBuilder()
			.setColor(Colors.White)
			.setThumbnail(user.displayAvatarURL({ size: 256, extension: 'png' }))
			.setDescription(this.getUserInformation(user))
			.addFields({
				name: translateKey(t, key('Titles.createdAt')),
				value: translateKey(t, key('Fields.createdAt'), {
					userCreatedAt: time(createdAt, TimestampStyles.ShortDateTime),
					userCreatedAtOffset: time(createdAt, TimestampStyles.RelativeTime)
				})
			})
			.setFooter({ text: translateKey(t, key('Fields.footer'), { user: { id: user.id } }), iconURL: this.getClientAvatar() })
			.setTimestamp();
	}

	private async member(t: TFunction, guildId: string, user: User, member: GuildMember) {
		const createdAt = seconds.fromMilliseconds(user.createdTimestamp);
		const joinedAt = member.joinedTimestamp === null ? null : seconds.fromMilliseconds(member.joinedTimestamp);
		const key = (name: string) => `${Root}:whoisMember${name}` as TranslationKey;

		const fields = {
			memberCreatedAt: time(createdAt, TimestampStyles.ShortDateTime),
			memberCreatedAtOffset: time(createdAt, TimestampStyles.RelativeTime),
			memberJoinedAt: joinedAt === null ? '' : time(joinedAt, TimestampStyles.ShortDateTime),
			memberJoinedAtOffset: joinedAt === null ? '' : time(joinedAt, TimestampStyles.RelativeTime)
		};

		const embed = new EmbedBuilder()
			.setColor((await member.displayColor) || Colors.White)
			.setThumbnail(member.displayAvatarURL({ size: 256, extension: 'png' }) ?? user.displayAvatarURL({ size: 256, extension: 'png' }))
			.setDescription(this.getUserInformation(user, this.getBoostIcon(member.premiumSinceTimestamp)))
			.addFields(
				{
					name: translateKey(t, key('Titles.joined')),
					value: translateKey(t, key(joinedAt === null ? 'Fields.joinedUnknown' : 'Fields.joinedWithTimestamp'), fields),
					inline: true
				},
				{ name: translateKey(t, key('Titles.createdAt')), value: translateKey(t, key('Fields.createdAt'), fields), inline: true }
			)
			.setFooter({ text: translateKey(t, key('Fields.footer'), { member: { id: user.id } }), iconURL: this.getClientAvatar() })
			.setTimestamp();

		await this.applyMemberRoles(t, guildId, member, embed);
		await this.applyMemberKeyPermissions(t, member, embed);
		return embed;
	}

	private getClientAvatar() {
		return this.container.gatewayClient.user!.displayAvatarURL({ size: 128 });
	}

	private getUserInformation(user: User, extras = ''): string {
		const bot = user.bot ? ` ${Emojis.Bot}` : '';
		const avatar = `[Avatar ${Emojis.Frame}](${user.displayAvatarURL({ size: 4096, extension: 'png' })})`;
		return `**${getTag(user)}**${bot} - ${userMention(user.id)}${extras} - ${avatar}`;
	}

	private async applyMemberRoles(t: TFunction, guildId: string, member: GuildMember, embed: EmbedBuilder) {
		// `@everyone` is not part of the roles of the member:
		const roles = (await member.roles.fetch()).filter((role) => role.id !== guildId).sort((x, y) => y.position - x.position);
		if (roles.length === 0) return;

		addAutomaticFields(
			embed,
			translateKey(t, `${Root}:whoisMemberRoles`, { count: roles.length }),
			roles.map((role) => roleMention(role.id)).join(' ')
		);
	}

	private async applyMemberKeyPermissions(t: TFunction, member: GuildMember, embed: EmbedBuilder) {
		const name = translateKey(t, `${Root}:whoisMemberPermissions`);
		const bits = BigInt((await member.permissions).bitField);
		if (PermissionsBits.has(bits, PermissionFlagsBits.Administrator)) {
			embed.addFields({ name, value: translateKey(t, `${Root}:whoisMemberPermissionsAll`) });
			return;
		}

		const permissions: string[] = [];
		for (const permission of KeyPermissions) {
			if (PermissionsBits.has(bits, PermissionFlagsBits[permission])) permissions.push(translateKey(t, `permissions:${permission}`));
		}

		if (permissions.length > 0) embed.addFields({ name, value: permissions.join(', ') });
	}

	private getBoostIcon(boostingSince: number | null): string {
		if (boostingSince === null || boostingSince <= 0) return '';
		return ` ${this.getBoostEmoji(Date.now() - boostingSince)}`;
	}

	private getBoostEmoji(duration: number): string {
		if (duration >= months(24)) return Emojis.BoostLevel9;
		if (duration >= months(18)) return Emojis.BoostLevel8;
		if (duration >= months(15)) return Emojis.BoostLevel7;
		if (duration >= months(12)) return Emojis.BoostLevel6;
		if (duration >= months(9)) return Emojis.BoostLevel5;
		if (duration >= months(6)) return Emojis.BoostLevel4;
		if (duration >= months(3)) return Emojis.BoostLevel3;
		if (duration >= months(2)) return Emojis.BoostLevel2;
		return Emojis.BoostLevel1;
	}
}
