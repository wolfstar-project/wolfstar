import { MaximumAppealReasonLength } from '#lib/moderation/appeals';
import { runAppealDecision } from '#lib/moderation/appealCommands';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/appeal approve`, see the `appeal` parent command. It accepts an appeal as the `Accept` button of its message does,
 * which undoes its case.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:approve')
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsAppeal').setRequired(true).setAutocomplete(true))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsReason').setMaxLength(MaximumAppealReasonLength))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal approve'>) {
		return runAppealDecision(interaction, options, true);
	}
}
