import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { deleteAppealBlock } from 'wolfstar-database';

/**
 * `/appeal unblock`, see the `appeal` parent command. It lets a user `/appeal block` kept out, or a denial blocked, appeal
 * in the server again.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:unblock').addUserOption((option) =>
		applyLocalizedBuilder(option, 'commands/appeal:optionsUser').setRequired(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal unblock'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const { id } = options.user.user;
		const removed = await deleteAppealBlock(container.prisma, interaction.guildId, id);

		const key = removed ? 'commands/appeal:unblocked' : 'commands/appeal:unblockedAlready';
		return interaction.reply({ content: t(key, { user: userMention(id) }), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
