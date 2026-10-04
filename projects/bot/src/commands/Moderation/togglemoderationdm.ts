import { toggleUserReportEnabled } from '#lib/database';
import { createTranslator } from '#lib/structures/commands/utils';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord-api-types/v10';

/**
 * Toggles whether the user receives the direct messages about the moderation actions taken on them, which is the
 * `report` column of the `User` model.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:toggleModerationDm')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));

		const enabled = await toggleUserReportEnabled(interaction.user.id);
		const key = enabled ? 'commands/moderation:toggleModerationDmToggledEnabled' : 'commands/moderation:toggleModerationDmToggledDisabled';
		return interaction.reply({ content: t(key), flags: MessageFlags.Ephemeral });
	}
}
