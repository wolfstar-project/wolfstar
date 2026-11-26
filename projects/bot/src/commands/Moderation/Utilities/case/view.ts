import type { GuildChatInputInteraction } from '#lib/structures/commands';
import { fetchCaseViewDetails, renderCaseView } from '#lib/structures/case-menu';
import { getCase, getDisplayT, handleCase } from '#lib/structures/commands/moderationCase';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/case view`, see the `case` parent command.
 *
 * @remarks It answers with the case as the case menu shows it, with the buttons that edit it, close it, show its
 * history and delete it, see `lib/structures/case-menu`.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:view')
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsShow'))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'case view'>) {
		return handleCase(interaction, async () => {
			const entry = await getCase(interaction, options.case);
			const show = options.show ?? false;

			// The note of the moderators and the proof are only shown to the moderator:
			const details = show ? null : await fetchCaseViewDetails(interaction.guildId, entry.id);
			return interaction.reply(
				renderCaseView({ t: getDisplayT(interaction, show), ownerId: interaction.user.id, ephemeral: !show }, entry, details)
			);
		});
	}
}
