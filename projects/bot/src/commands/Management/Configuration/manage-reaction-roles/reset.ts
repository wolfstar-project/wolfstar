import { writeSettings } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/reaction-roles reset`, see the `reaction-roles` parent command.
 */
@RegisterAsSubcommand('reaction-roles', (builder) => applyLocalizedBuilder(builder, `commands/management:manageReactionRolesSubcommandReset`))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		await writeSettings(interaction.guildId, { reactionRoles: [] }, interaction.user.id);

		const t = getSupportedUserLanguageT(interaction);
		return interaction.reply({ content: translateKey(t, 'commands/management:manageReactionRolesReset'), flags: MessageFlags.Ephemeral });
	}
}
