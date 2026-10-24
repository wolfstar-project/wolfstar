import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { inlineCode, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchMessageHistories } from 'wolfstar-database';

const Root = 'commands/archive';

/**
 * `/archive list`, see the `archive` parent command. Lists the latest message histories, of a member or of everyone.
 */
@RegisterAsSubcommand('archive', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:list`).addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser'))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'archive list'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const histories = (await fetchMessageHistories(this.container.prisma, interaction.guildId, options.user?.id)).slice(0, 15);
		const content =
			histories.length === 0
				? t(`${Root}:listEmpty`)
				: histories
						.map((history) =>
							t(`${Root}:listLine`, {
								id: inlineCode(history.id),
								user: userMention(history.userId),
								count: history.messages.length,
								time: time(Math.floor(history.createdAt / 1000), TimestampStyles.ShortDate),
								moderator: userMention(history.moderatorId)
							})
						)
						.join('\n');

		return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
