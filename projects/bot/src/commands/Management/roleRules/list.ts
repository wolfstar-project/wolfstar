import { formatRoleRule } from '#lib/roles/format';
import { readRoleRules } from '#lib/roles/rules';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { MaximumRoleRules } from 'wolfstar-database';

const Root = 'commands/role-rules';

/**
 * `/role-rules list`, see the `role-rules` parent command. Lists the role rules of the server.
 */
@RegisterAsSubcommand('role-rules', (builder) => applyLocalizedBuilder(builder, `${Root}:list`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const rules = await readRoleRules(interaction.guildId);
		const content =
			rules.length === 0
				? t(`${Root}:listEmpty`)
				: [
						t(`${Root}:listTitle`, { count: rules.length, maximum: MaximumRoleRules }),
						...rules.map((rule) => `- ${formatRoleRule(t, rule)}`)
					].join('\n');

		return interaction.reply({ content: content.slice(0, 2000), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
