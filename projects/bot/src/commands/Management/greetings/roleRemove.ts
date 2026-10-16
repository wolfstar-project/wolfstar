import { removeRoleMessage } from '#lib/greetings/roleMessages';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { roleMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/greetings';

/**
 * `/greetings role-remove`, see the `greetings` parent command. Removes the messages of a role.
 */
@RegisterAsSubcommand('greetings', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:roleRemove`).addRoleOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsRole`).setRequired(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'greetings role-remove'>) {
		const t = getSupportedUserLanguageT(interaction);
		const removed = await removeRoleMessage(interaction.guildId, options.role.id);
		return interaction.reply({
			content: translateKey(t, removed ? `${Root}:roleRemoved` : `${Root}:roleNotFound`, { role: roleMention(options.role.id) }),
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] }
		});
	}
}
