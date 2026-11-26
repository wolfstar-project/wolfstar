import { closeCase } from '#lib/moderation/caseEdits';
import type { GuildChatInputInteraction } from '#lib/structures/commands';
import { getCase, getDisplayT, handleCase } from '#lib/structures/commands/moderationCase';
import { renderStatus } from '#utils/status';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/case archive`, see the `case` parent command.
 *
 * @remarks It closes the case as the `Close` button of the case menu does, with no reason and without telling the user.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:archive') //
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'case archive'>) {
		return handleCase(interaction, async () => {
			const entry = await getCase(interaction, options.case);
			const t = getDisplayT(interaction, false);
			const outcome = await closeCase({ entry, moderatorId: interaction.user.id, t, reason: null, notify: false });

			const closed = outcome.changes.length > 0;
			return interaction.reply(
				renderStatus(
					closed ? 'success' : 'info',
					t(closed ? 'commands/case:archiveSuccess' : 'commands/case:closeAlready', { caseId: entry.id })
				)
			);
		});
	}
}
