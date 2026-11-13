import { getMessageHistoryFile } from '#lib/moderation/historyReply';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchMessageHistory } from 'wolfstar-database';

const Root = 'commands/archive';

/**
 * `/archive show`, see the `archive` parent command. Answers with the file of a message history, by its ID.
 */
@RegisterAsSubcommand('archive', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:show`).addStringOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsId`).setRequired(true).setMaxLength(20)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'archive show'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const history = await fetchMessageHistory(this.container.prisma, interaction.guildId, options.id.trim());
		if (history === null) return interaction.reply({ content: t(`${Root}:notFound`), flags: MessageFlags.Ephemeral });

		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		return deferred.update({ files: [await getMessageHistoryFile(history)] });
	}
}
