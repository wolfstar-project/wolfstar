import { AutoModerationRoot, applyRuleOption, resolveCommandRule, translateRuleError } from '#lib/moderation/automod/commands';
import { deleteAutoModerationRule } from '#lib/moderation/automod/rules';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { renderStatus } from '#utils/status';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

const Root = AutoModerationRoot;

/**
 * `/automod delete`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) => applyRuleOption(applyLocalizedBuilder(builder, `${Root}:delete`)))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod delete'>) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		try {
			await deleteAutoModerationRule(interaction.guildId, rule.id);
		} catch (error) {
			return interaction.reply(renderStatus('error', translateRuleError(t, error, options.rule)));
		}

		return interaction.reply(renderStatus('success', translateKey(t, `${Root}:deleteSuccess`, { name: rule.name })));
	}
}
