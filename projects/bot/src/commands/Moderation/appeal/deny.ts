import { MaximumAppealReasonLength } from '#lib/moderation/appeals';
import { runAppealDecision } from '#lib/moderation/appealCommands';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/appeal deny`, see the `appeal` parent command. It denies an appeal as the `Deny` button of its message does, which
 * keeps its case.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:deny')
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsAppeal').setRequired(true).setAutocomplete(true))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsReason').setMaxLength(MaximumAppealReasonLength))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal deny'>) {
		return runAppealDecision(interaction, options, false);
	}
}
