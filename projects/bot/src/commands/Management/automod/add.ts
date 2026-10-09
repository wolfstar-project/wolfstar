import { AutoModerationRoot, applyRuleOption } from '#lib/moderation/automod/commands';
import { editRuleList } from '#lib/structures/automod-menu';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

const Root = AutoModerationRoot;

/**
 * `/automod add`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) =>
	applyRuleOption(applyLocalizedBuilder(builder, `${Root}:add`)).addStringOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsValue`).setRequired(true).setMinLength(2).setMaxLength(100)
	)
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod add'>) {
		return editRuleList(interaction, options, 'add');
	}
}
