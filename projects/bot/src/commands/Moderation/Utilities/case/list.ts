import type { GuildChatInputInteraction } from '#lib/structures/commands';
import { renderCaseList } from '#lib/structures/case-menu';
import { getDisplayT, handleCase, listOverview } from '#lib/structures/commands/moderationCase';
import { getModeration } from '#utils/functions';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/case list`, see the `case` parent command.
 *
 * @remarks It answers with the case menu, see `lib/structures/case-menu`: its select menu filters the cases and its
 * buttons go from a page to another and open a case, which the `caseMenu` interaction handler does.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:list')
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsUser'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsOverview'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsShow'))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'case list'>) {
		return handleCase(interaction, async () => {
			const show = options.show ?? false;
			const user = options.user?.user ?? null;

			const moderation = await getModeration(interaction.guildId);
			const entries = [...(await moderation.fetch({ userId: user?.id })).values()];

			const displayT = getDisplayT(interaction, show);
			if (options.overview) {
				const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
				return deferred.update({ embeds: [listOverview(displayT, entries, user).toJSON()] });
			}

			return interaction.reply(
				renderCaseList(
					{ t: displayT, ownerId: interaction.user.id, ephemeral: !show },
					{ filter: 'all', userId: user?.id ?? null, page: 0 },
					entries
				)
			);
		});
	}
}
