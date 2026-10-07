import { AutoModerationRoot, applyRuleOption, resolveCommandRule, translateRuleError } from '#lib/moderation/automod/commands';
import { updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention, roleMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

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
	public override async chatInputRun(
		interaction: GuildChatInputInteraction,
		options: { rule: string; role?: TransformedArguments.Role; channel?: TransformedArguments.Channel }
	) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		let content: string;
		if (!options.role && !options.channel) {
			content = translateKey(t, `${Root}:ignoreNothing`);
		} else {
			const lines: string[] = [];
			const toggle = (list: readonly string[], id: string, target: string) => {
				const ignored = list.includes(id);
				lines.push(translateKey(t, ignored ? `${Root}:ignoreRemoved` : `${Root}:ignoreAdded`, { name: rule.name, target }));
				return ignored ? list.filter((entry) => entry !== id) : [...list, id];
			};

			try {
				// Toggled on the rule the database has, the cached one may be behind another change:
				await updateAutoModerationRule(interaction.guildId, rule.id, (current) => ({
					...(options.role && { ignoredRoles: toggle(current.ignoredRoles, options.role.id, roleMention(options.role.id)) }),
					...(options.channel && {
						ignoredChannels: toggle(current.ignoredChannels, options.channel.id, channelMention(options.channel.id))
					})
				}));
				content = lines.join('\n');
			} catch (error) {
				content = translateRuleError(t, error, options.rule);
			}
		}

		return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
