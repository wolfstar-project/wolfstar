import { AutoModerationRoot, AutoModerationRuleTypeKeys, translateRuleError } from '#lib/moderation/automod/commands';
import { createAutoModerationRule } from '#lib/moderation/automod/rules';
import { renderAutoModerationRule } from '#lib/structures/automod-menu';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { AutoModerationRuleTypes, MaximumAutoModerationRuleNameLength, type AutoModerationRule } from 'wolfstar-database';

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
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod create'>) {
		const t = getSupportedUserLanguageT(interaction);

		let rule: AutoModerationRule;
		try {
			rule = await createAutoModerationRule(interaction.guildId, options.name, options.type);
		} catch (error) {
			return interaction.reply({ content: translateRuleError(t, error, options.name), flags: MessageFlags.Ephemeral });
		}

		// The rule is opened in the menu it is configured in, see the `automod` interaction handler:
		const notice = translateKey(t, `${Root}:menuCreated`);
		const message = renderAutoModerationRule({ t, ownerId: interaction.user.id }, rule, 'options', { notice });
		return interaction.reply({ ...message, flags: message.flags! | MessageFlags.Ephemeral });
	}
}
