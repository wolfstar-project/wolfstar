import { AutoModerationRoot, applyRuleOption, resolveCommandRule } from '#lib/moderation/automod/commands';
import { renderAutoModerationRule } from '#lib/structures/automod-menu';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/automod show`, see the `automod` parent command. It opens the auto-moderation menu on a rule.
 */
@RegisterAsSubcommand('automod', (builder) => applyRuleOption(applyLocalizedBuilder(builder, `${AutoModerationRoot}:show`)))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod show'>) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		// The menu the rule is configured in, see the `automod` interaction handler:
		const message = renderAutoModerationRule({ t, ownerId: interaction.user.id }, rule, 'options');
		return interaction.reply({ ...message, flags: message.flags! | MessageFlags.Ephemeral });
	}
}
