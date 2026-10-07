import { AutoModerationRoot, AutoModerationRuleTypeKeys, translateRuleError } from '#lib/moderation/automod/commands';
import { createAutoModerationRule } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { AutoModerationRuleTypes, MaximumAutoModerationRuleNameLength, type AutoModerationRuleType } from 'wolfstar-database';

const Root = AutoModerationRoot;

/**
 * `/automod create`, see the `automod` parent command.
 */
@RegisterAsSubcommand('automod', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:create`)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsName`).setRequired(true).setMaxLength(MaximumAutoModerationRuleNameLength)
		)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsType`)
				.setRequired(true)
				.setChoices(...AutoModerationRuleTypes.map((type) => createLocalizedChoice(AutoModerationRuleTypeKeys[type], { value: type })))
		)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: { name: string; type: AutoModerationRuleType }) {
		const t = getSupportedUserLanguageT(interaction);

		let content: string;
		try {
			const rule = await createAutoModerationRule(interaction.guildId, options.name, options.type);
			content = translateKey(t, `${Root}:createSuccess`, {
				name: rule.name,
				type: translateKey(t, AutoModerationRuleTypeKeys[rule.type]),
				command: inlineCode('/automod edit')
			});
		} catch (error) {
			content = translateRuleError(t, error, options.name);
		}

		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}
