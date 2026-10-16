import { archiveMemberMessages } from '#lib/moderation/histories';
import { getMessageHistoryFile } from '#lib/moderation/historyReply';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/archive';

/**
 * `/archive create`, see the `archive` parent command. Saves the recent messages of a member, optionally for a case,
 * and answers with the file of the history.
 */
@RegisterAsSubcommand('archive', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:create`)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true))
		.addIntegerOption((option) => applyLocalizedBuilder(option, `${Root}:optionsCase`).setMinValue(1))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'archive create'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		// Reading the channels takes longer than Discord waits for an answer:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		const history = await archiveMemberMessages(guild, options.user.id, interaction.user.id, options.case ?? null);
		return deferred.update({
			content: t(`${Root}:created`, { id: history.id, user: userMention(options.user.id), count: history.messages.length }),
			files: [await getMessageHistoryFile(history)],
			allowed_mentions: { parse: [] }
		});
	}
}
