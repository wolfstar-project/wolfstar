import { readSettings, writeSettings, writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { minutes } from '#utils/common';
import { getEmojiObject, getEmojiString, getEmojiTextFormat, type SerializedEmoji } from '#utils/functions';
import { LongLivingReactionCollector } from '#utils/LongLivingReactionCollector';
import { getColor } from '#utils/util';
import { channelMention, EmbedBuilder, hideLinkEmbed, hyperlink, roleMention } from '@discordjs/builders';
import { chunk } from '@sapphire/utilities';
import { Command, RegisterCommand, RegisterSubcommand, container, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * An entry of the `reactionRoles` setting.
 */
interface ReactionRole {
	emoji: SerializedEmoji;
	/**
	 * The message the reaction role is bound to, or `null` if it applies to every message of {@linkcode ReactionRole.channel}.
	 */
	message: string | null;
	channel: string;
	role: string;
}

const Root = 'commands/management:manageReactionRoles';

/**
 * The amount of reaction roles in each embed, what a page of the prefix command had.
 */
const EntriesPerEmbed = 15;

/**
 * The maximum amount of embeds Discord accepts in a message.
 */
const MaximumEmbeds = 10;

const SnowflakeRegExp = /^\d{17,20}$/;

@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, Root)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandAdd`)
			.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
			.addChannelOption((option) =>
				applyLocalizedBuilder(option, `${Root}OptionsChannel`)
					.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
					.setRequired(false)
			)
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}OptionsEmoji`).setRequired(false))
	)
	public async add(interaction: GuildChatInputInteraction, options: UserCommand.AddArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { role, channel, emoji } = options;

		// A channel and an emoji bind the role to every message of the channel:
		if (channel !== undefined || emoji !== undefined) {
			if (channel === undefined || emoji === undefined) {
				return interaction.reply({ content: translateKey(t, `${Root}AddIncomplete`), flags: MessageFlags.Ephemeral });
			}

			const emojiObject = getEmojiObject(emoji);
			if (emojiObject === null) {
				return interaction.reply({ content: translateKey(t, 'arguments:emojiError', { parameter: emoji }), flags: MessageFlags.Ephemeral });
			}

			const reactionRole: ReactionRole = { emoji: getEmojiString(emojiObject), message: null, channel: channel.id, role: role.id };
			await writeSettings(
				interaction.guildId,
				(settings) => ({ reactionRoles: settings.reactionRoles.concat(reactionRole) }),
				interaction.user.id
			);

			const content = translateKey(t, 'commands/management:manageReactionRolesAddChannel', {
				emoji: getEmojiTextFormat(reactionRole.emoji),
				channel: channelMention(channel.id)
			});
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		// Otherwise, the first reaction of the author binds the role to its message:
		const prompt = await interaction.reply({
			content: translateKey(t, 'commands/management:manageReactionRolesAddPrompt'),
			flags: MessageFlags.Ephemeral
		});

		const reaction = await LongLivingReactionCollector.collectOne({
			filter: (reaction) => reaction.userId === interaction.user.id && reaction.guildId === interaction.guildId,
			time: minutes(5)
		});

		if (reaction === null) {
			return prompt.update({ content: translateKey(t, 'commands/management:manageReactionRolesAddMissing') });
		}

		const reactionRole: ReactionRole = {
			emoji: getEmojiString(reaction.emoji),
			message: reaction.messageId,
			channel: reaction.channelId,
			role: role.id
		};
		using trx = await writeSettingsTransaction(interaction.guildId);
		await trx.write({ reactionRoles: trx.settings.reactionRoles.concat(reactionRole) }).submitWithAudit(interaction.user.id);

		const url = `<https://discord.com/channels/${interaction.guildId}/${reactionRole.channel}/${reactionRole.message}>`;
		const content = translateKey(t, 'commands/management:manageReactionRolesAdd', { emoji: getEmojiTextFormat(reactionRole.emoji), url });
		return prompt.update({ content });
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandRemove`)
			.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}OptionsRemoveMessage`).setRequired(true))
	)
	public async remove(interaction: GuildChatInputInteraction, options: UserCommand.RemoveArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { role, message } = options;
		if (!SnowflakeRegExp.test(message)) {
			const content = translateKey(t, 'arguments:snowflake', { parameter: message, message: { id: interaction.id } });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		using trx = await writeSettingsTransaction(interaction.guildId);
		const { reactionRoles } = trx.settings;
		const index = reactionRoles.findIndex((entry: ReactionRole) => (entry.message ?? entry.channel) === message && entry.role === role.id);
		if (index === -1) {
			return interaction.reply({
				content: translateKey(t, 'commands/management:manageReactionRolesRemoveNotExists'),
				flags: MessageFlags.Ephemeral
			});
		}

		const reactionRole = reactionRoles[index];
		await trx.write({ reactionRoles: reactionRoles.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);

		const url = reactionRole.message
			? `<https://discord.com/channels/${interaction.guildId}/${reactionRole.channel}/${reactionRole.message}>`
			: channelMention(reactionRole.channel);
		const content = translateKey(t, 'commands/management:manageReactionRolesRemove', { emoji: getEmojiTextFormat(reactionRole.emoji), url });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) => applyLocalizedBuilder(builder, `${Root}SubcommandReset`))
	public async reset(interaction: GuildChatInputInteraction) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		await writeSettings(interaction.guildId, { reactionRoles: [] }, interaction.user.id);

		const t = getSupportedUserLanguageT(interaction);
		return interaction.reply({ content: translateKey(t, 'commands/management:manageReactionRolesReset'), flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) => applyLocalizedBuilder(builder, `${Root}SubcommandShow`))
	public async show(interaction: GuildChatInputInteraction) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { reactionRoles } = await readSettings(interaction.guildId);
		if (reactionRoles.length === 0) {
			return interaction.reply({ content: translateKey(t, 'commands/management:manageReactionRolesShowEmpty'), flags: MessageFlags.Ephemeral });
		}

		const member = await container.gatewayClient.members.fetch(interaction.guildId, interaction.user.id);
		const color = await getColor({ member });

		// The prefix command paginated the list, the interaction sends every page as an embed instead:
		const embeds = chunk(reactionRoles as readonly ReactionRole[], EntriesPerEmbed)
			.slice(0, MaximumEmbeds)
			.map((bulk) =>
				new EmbedBuilder()
					.setColor(color)
					.setDescription(bulk.map((entry) => this.format(entry, interaction.guildId)).join('\n'))
					.toJSON()
			);
		return interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
	}

	private format(entry: ReactionRole, guildId: string): string {
		const emoji = getEmojiTextFormat(entry.emoji);
		const role = roleMention(entry.role);
		const url = entry.message
			? hyperlink('🔗', hideLinkEmbed(`https://discord.com/channels/${guildId}/${entry.channel}/${entry.message}`))
			: channelMention(entry.channel);
		return `${emoji} | ${role} -> ${url}`;
	}
}

export namespace UserCommand {
	export interface AddArguments {
		role: TransformedArguments.Role;
		channel?: TransformedArguments.Channel;
		emoji?: string;
	}

	export interface RemoveArguments {
		role: TransformedArguments.Role;
		message: string;
	}
}
