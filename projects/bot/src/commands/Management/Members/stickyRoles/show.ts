import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getStickyRoles } from '#utils/functions';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/sticky-roles show`, see the `sticky-roles` parent command.
 */
@RegisterAsSubcommand('sticky-roles', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:stickyRolesSubcommandShow').addUserOption((option) =>
		applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const { user } = options;
		const t = getSupportedUserLanguageT(interaction);

		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		const sticky = await (await getStickyRoles(guild)).fetch(user.id);
		if (sticky.length === 0) {
			return interaction.reply({ content: translateKey(t, 'commands/management:stickyRolesShowEmpty'), flags: MessageFlags.Ephemeral });
		}

		const { roles } = this.container.gatewayClient;
		const names = await Promise.all(
			sticky.map(async (roleId) => {
				const role = await roles.cache.get(roles.resolveKey(interaction.guildId, roleId));
				return `\`${role?.name ?? roleId}\``;
			})
		);

		const content = translateKey(t, 'commands/management:stickyRolesShowSingle', { user: user.user.username, roles: names });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	user: TransformedArguments.User;
}
