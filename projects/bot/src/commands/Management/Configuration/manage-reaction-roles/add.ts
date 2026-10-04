import { writeSettings, writeSettingsTransaction, type ReactionRole } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { minutes } from '#common';
import { getEmojiObject, getEmojiString, getEmojiTextFormat } from '#utils/functions';
import { LongLivingReactionCollector } from '#utils/LongLivingReactionCollector';
import { channelMention } from '@discordjs/builders';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

/**
 * `/reaction-roles add`, see the `reaction-roles` parent command.
 */
@RegisterAsSubcommand('reaction-roles', (builder) =>
	applyLocalizedBuilder(builder, `commands/management:manageReactionRolesSubcommandAdd`)
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `commands/management:manageReactionRolesOptionsChannel`)
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `commands/management:manageReactionRolesOptionsEmoji`).setRequired(false))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);
		const { role, channel, emoji } = options;

		// A channel and an emoji bind the role to every message of the channel:
		if (channel !== undefined || emoji !== undefined) {
			if (channel === undefined || emoji === undefined) {
				return interaction.reply({
					content: translateKey(t, `commands/management:manageReactionRolesAddIncomplete`),
					flags: MessageFlags.Ephemeral
				});
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
}

interface Options {
	role: TransformedArguments.Role;
	channel?: TransformedArguments.Channel;
	emoji?: string;
}
