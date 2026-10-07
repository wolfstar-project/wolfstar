import { AutoModerationRoot, renderRuleList } from '#lib/moderation/automod/commands';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/automod list`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) => applyLocalizedBuilder(builder, `${AutoModerationRoot}:list`))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const rules = await readAutoModerationRules(interaction.guildId);
		return interaction.reply({ embeds: [renderRuleList(t, rules).toJSON()], flags: MessageFlags.Ephemeral });
	}
}
