import { writeSettings } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { Command, RegisterCommand, UserError, container } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * Prepares the mute system.
 *
 * @remarks
 *
 * - with the `role` option, that role is configured as the muted role.
 * - without it, a new role is created and the channel overrides are applied, like `SetUpModerationCommand` does.
 *
 * There is no cooldown, the command is guarded by its default member permissions.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:createMute')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/management:createMuteOptionsRole').setRequired(false))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: UserCommand.Arguments) {
		const t = getSupportedUserLanguageT(interaction);
		const { role } = options;
		if (role) {
			await writeSettings(interaction.guildId, { rolesMuted: role.id }, interaction.user.id);

			const content = translateKey(t, 'commands/conf:updated', { key: 'rolesMuted', response: role.name });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		try {
			const guild = await container.gatewayClient.guilds.fetch(interaction.guildId);
			await ModerationActions.mute.setup({ guild, author: interaction.user, confirm: () => true });
		} catch (error) {
			if (error instanceof UserError) {
				return deferred.update({ content: translateKey(t, error.identifier as TranslationKey, error.context as Record<string, unknown>) });
			}
			throw error;
		}

		return deferred.update({ content: translateKey(t, 'moderation:success') });
	}
}

export namespace UserCommand {
	export interface Arguments {
		role?: { id: string; name: string };
	}
}
