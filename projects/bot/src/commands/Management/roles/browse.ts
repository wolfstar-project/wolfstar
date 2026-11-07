import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { createRolesMenuContext, renderRolesList } from '#lib/structures/roles-menu';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/roles browse`, see the `roles` parent command. It opens the roles menu: a page of the roles of the server, and a
 * page with a select menu of the roles to see one of them, see `lib/structures/roles-menu`.
 */
@RegisterAsSubcommand('roles', (builder) => applyLocalizedBuilder(builder, 'commands/management:rolesSubcommandBrowse'))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const context = await createRolesMenuContext(interaction, interaction.guildId, interaction.user.id);
		return interaction.reply(renderRolesList(context, 0));
	}
}
