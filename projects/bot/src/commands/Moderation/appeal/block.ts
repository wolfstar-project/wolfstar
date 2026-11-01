import { MaximumAppealReasonLength } from '#lib/moderation/appeals';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { createAppealBlock } from 'wolfstar-database';

/**
 * `/appeal block`, see the `appeal` parent command. It keeps a user from appealing in the server, who sees the reason on
 * the appeal page, until `/appeal unblock`.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:block')
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsUser').setRequired(true))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsBlockReason').setMaxLength(MaximumAppealReasonLength))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal block'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const { id } = options.user.user;
		const data = { userId: id, reason: options.reason?.trim() || null, moderatorId: interaction.user.id, automatic: false };
		const created = await createAppealBlock(container.prisma, interaction.guildId, data);

		const key = created ? 'commands/appeal:blocked' : 'commands/appeal:blockedAlready';
		return interaction.reply({ content: t(key, { user: userMention(id) }), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
