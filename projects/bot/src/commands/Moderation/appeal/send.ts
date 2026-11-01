import { MaximumAppealMessageLength } from '#lib/moderation/appeals';
import { sendAppealDirectMessage } from '#lib/moderation/appealService';
import { fetchGuildT } from '#lib/moderation/common/util';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchAppealByMessage } from 'wolfstar-database';

/**
 * `/appeal send`, see the `appeal` parent command. Run in the thread of an appeal, it sends a direct message to the
 * member who made it, and the answer stays in the thread for the other moderators, in the language of the guild as the
 * appeal is. The member is not told who wrote.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:send').addStringOption((option) =>
		applyLocalizedBuilder(option, 'commands/appeal:optionsMessage').setRequired(true).setMaxLength(MaximumAppealMessageLength)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal send'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const appeal = await fetchAppealByMessage(this.container.prisma, interaction.guildId, interaction.channelId);
		if (appeal === null) return interaction.reply({ content: t('commands/appeal:sendNotThread'), flags: MessageFlags.Ephemeral });

		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		const sent = await sendAppealDirectMessage(guild, appeal, options.message);
		if (!sent) return interaction.reply({ content: t('commands/appeal:sendFailed'), flags: MessageFlags.Ephemeral });

		const guildT = await fetchGuildT(guild);
		const content = guildT('commands/appeal:sent', { moderator: userMention(interaction.user.id), message: options.message });
		return interaction.reply({ content, allowed_mentions: { parse: [] } });
	}
}
