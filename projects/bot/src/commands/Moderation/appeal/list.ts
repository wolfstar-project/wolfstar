import { AppealListAllForms, fetchAppealListPage, renderAppealList } from '#lib/moderation/appealList';
import { getDisplayT } from '#lib/structures/commands/moderationCase';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/appeal list`, see the `appeal` parent command. It lists the appeals of the server, with a select menu that shows the
 * ones in a status, see `lib/moderation/appealList.ts`.
 */
@RegisterAsSubcommand('appeal', (builder) => applyLocalizedBuilder(builder, 'commands/appeal:list'))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const page = await fetchAppealListPage(getDisplayT(interaction, false), interaction.guildId, 'all', AppealListAllForms, 0);
		return interaction.reply(renderAppealList(page));
	}
}
