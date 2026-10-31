import { removeRoleRule } from '#lib/roles/rules';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { roleMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/role-rules';

/**
 * `/role-rules remove`, see the `role-rules` parent command. Removes the rule of a role; the members keep it.
 */
@RegisterAsSubcommand('role-rules', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:remove`).addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRole`).setRequired(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'role-rules remove'>) {
		const t = getSupportedUserLanguageT(interaction);
		const removed = await removeRoleRule(interaction.guildId, options.role.id);
		return interaction.reply({
			content: translateKey(t, removed ? `${Root}:removed` : `${Root}:notFound`, { role: roleMention(options.role.id) }),
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] }
		});
	}
}
