import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getStickyRoles } from '#utils/functions';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/sticky-roles add`, see the `sticky-roles` parent command.
 */
@RegisterAsSubcommand('sticky-roles', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:stickyRolesSubcommandAdd')
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true))
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'sticky-roles add'>) {
		const { user, role } = options;

		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		await (await getStickyRoles(guild)).add(user.id, role.id);

		const t = getSupportedUserLanguageT(interaction);
		const content = translateKey(t, 'commands/management:stickyRolesAdd', { user: user.user.username });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}
