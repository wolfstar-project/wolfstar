import { AutoModerationRoot, applyRuleOption } from '#lib/moderation/automod/commands';
import { editRuleList } from '#lib/structures/automod-menu';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

const Root = AutoModerationRoot;

/**
 * `/automod remove`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) =>
	applyRuleOption(applyLocalizedBuilder(builder, `${Root}:remove`)).addStringOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsValue`).setRequired(true).setMinLength(2).setMaxLength(100)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod remove'>) {
		return editRuleList(interaction, options, 'remove');
	}
}
