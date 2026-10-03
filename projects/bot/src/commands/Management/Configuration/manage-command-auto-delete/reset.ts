import { writeSettings } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-auto-delete reset`, see the `command-auto-delete` parent command.
 */
@RegisterAsSubcommand('command-auto-delete', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:managecommandautodeleteSubcommandReset')
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		await writeSettings(interaction.guildId, { commandsAutoDelete: [] }, interaction.user.id);

		const t = getSupportedUserLanguageT(interaction);
		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteReset');
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}
