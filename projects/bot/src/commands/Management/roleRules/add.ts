import { addRoleRule, RoleRuleError } from '#lib/roles/rules';
import { formatRoleRule } from '#lib/roles/format';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { roleMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/role-rules';

/**
 * `/role-rules add`, see the `role-rules` parent command. Gives a role to the members who have some roles and not
 * others, and takes it when they stop meeting the rule. It replaces the rule the role had.
 */
@RegisterAsSubcommand('role-rules', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:add`)
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRole`).setRequired(true))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRequires`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRequires2`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRequires3`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsAnyOf`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsAnyOf2`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsAnyOf3`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWithout`))
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWithout2`))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'role-rules add'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
		const ids = (...roles: ({ id: string } | undefined)[]) => [...new Set(roles.filter((role) => role !== undefined).map((role) => role.id))];

		const rule = {
			roleId: options.role.id,
			requiredRoles: ids(options.requires, options['requires-2'], options['requires-3']),
			anyRoles: ids(options['any-of'], options['any-of-2'], options['any-of-3']),
			forbiddenRoles: ids(options.without, options['without-2'])
		};
		if (rule.requiredRoles.length + rule.anyRoles.length + rule.forbiddenRoles.length === 0) return reply(t(`${Root}:noConditions`));
		// `@everyone` is every member's, a rule on it would give or take it from everybody:
		if (rule.roleId === interaction.guildId) return reply(t(`${Root}:everyone`));

		try {
			const created = await addRoleRule(interaction.guildId, rule);
			return reply(t(created ? `${Root}:added` : `${Root}:replaced`, { rule: formatRoleRule(t, rule) }));
		} catch (error) {
			if (!(error instanceof RoleRuleError)) throw error;
			if (error.reason === 'limit') return reply(t(`${Root}:limit`));
			if (error.reason === 'self') return reply(t(`${Root}:self`));
			return reply(t(`${Root}:chained`, { role: roleMention(error.roleId ?? '') }));
		}
	}
}
