import { AutoModerationRoot, applyRuleOption, resolveCommandRule, translateRuleError } from '#lib/moderation/automod/commands';
import { updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { replyWithAutoModerationRule } from '#lib/structures/automod-menu';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention, roleMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import type { AutoModerationRule } from 'wolfstar-database';

const Root = AutoModerationRoot;

/**
 * `/automod ignore`, see the `automod` parent command.
 *
 * @remarks A role or a channel the rule already leaves alone is given back to it, so the command toggles.
 */
@RegisterAsSubcommand('automod', (builder) =>
	applyRuleOption(applyLocalizedBuilder(builder, `${Root}:ignore`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRole`))
		.addChannelOption((option) => applyLocalizedBuilder(option, `${Root}:optionsChannel`))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automod ignore'>) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		const { role, channel } = options;
		if (!role && !channel) return interaction.reply({ content: translateKey(t, `${Root}:ignoreNothing`), flags: MessageFlags.Ephemeral });

		const lines: string[] = [];
		const toggle = (list: readonly string[], id: string, target: string) => {
			const ignored = list.includes(id);
			lines.push(translateKey(t, ignored ? `${Root}:ignoreRemoved` : `${Root}:ignoreAdded`, { name: rule.name, target }));
			return ignored ? list.filter((entry) => entry !== id) : [...list, id];
		};

		let updated: AutoModerationRule;
		try {
			// Toggled on the rule the database has, the cached one may be behind another change:
			updated = await updateAutoModerationRule(interaction.guildId, rule.id, (current) => ({
				...(role && { ignoredRoles: toggle(current.ignoredRoles, role.id, roleMention(role.id)) }),
				...(channel && { ignoredChannels: toggle(current.ignoredChannels, channel.id, channelMention(channel.id)) })
			}));
		} catch (error) {
			return interaction.reply({ content: translateRuleError(t, error, options.rule), flags: MessageFlags.Ephemeral });
		}

		// The rule is opened on what it leaves alone, see the `automod` interaction handler:
		return replyWithAutoModerationRule(interaction, t, updated, 'exempt', lines.join(' '));
	}
}
