import { AutoModerationRoot, applyRuleOption, editRuleList } from '#lib/moderation/automod/commands';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';

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
	public override chatInputRun(interaction: GuildChatInputInteraction, options: CommandOptionsRegistry['automod remove']) {
		return editRuleList(interaction, options, 'remove');
	}
}
