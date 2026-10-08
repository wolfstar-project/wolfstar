import { AutoModerationRoot, applyRuleOption, renderRule, resolveCommandRule } from '#lib/moderation/automod/commands';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';

/**
 * `/automod show`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) => applyRuleOption(applyLocalizedBuilder(builder, `${AutoModerationRoot}:show`)))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: CommandOptionsRegistry['automod show']) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		return interaction.reply({ embeds: [renderRule(t, rule).toJSON()], flags: MessageFlags.Ephemeral });
	}
}
