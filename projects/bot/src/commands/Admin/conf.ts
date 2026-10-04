import { getConfigurableGroups } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { createSettingsMenuContext, renderSettingsGroup } from '#lib/structures/settings-menu';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * Opens the settings menu, to configure the bot from Discord as an alternative to the dashboard.
 *
 * @remarks
 *
 * The menu is a message made of components: a select menu picks the module, every key shows its value next to the
 * button that edits it, and every group can be reset. The clicks are handled by the `conf` interaction handler, and only
 * the user who ran the command can use the menu. It requires the administrator permission level.
 *
 * The keys that are only configurable on the dashboard are not shown.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/conf:name', 'commands/conf:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const context = await createSettingsMenuContext(interaction, interaction.guildId, interaction.user.id);
		return interaction.reply(renderSettingsGroup(context, getConfigurableGroups(), 0));
	}
}
