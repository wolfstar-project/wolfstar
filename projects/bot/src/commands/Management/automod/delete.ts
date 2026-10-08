import { AutoModerationRoot, applyRuleOption, resolveCommandRule, translateRuleError } from '#lib/moderation/automod/commands';
import { deleteAutoModerationRule } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = AutoModerationRoot;

/**
 * `/automod delete`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) => applyRuleOption(applyLocalizedBuilder(builder, `${Root}:delete`)))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod delete'>) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		let content: string;
		try {
			await deleteAutoModerationRule(interaction.guildId, rule.id);
			content = translateKey(t, `${Root}:deleteSuccess`, { name: rule.name });
		} catch (error) {
			content = translateRuleError(t, error, options.rule);
		}

		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}
