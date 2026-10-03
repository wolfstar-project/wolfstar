import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getStickyRoles } from '#utils/functions';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/sticky-roles reset`, see the `sticky-roles` parent command.
 */
@RegisterAsSubcommand('sticky-roles', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:stickyRolesSubcommandReset').addUserOption((option) =>
		applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const { user } = options;
		const t = getSupportedUserLanguageT(interaction);

		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		const stickyRoles = await getStickyRoles(guild);
		const roles = await stickyRoles.fetch(user.id);
		if (roles.length === 0) {
			const content = translateKey(t, 'commands/management:stickyRolesNotExists', { user: user.user.username });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await stickyRoles.clear(user.id);

		const content = translateKey(t, 'commands/management:stickyRolesReset', { user: user.user.username });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	user: TransformedArguments.User;
}
