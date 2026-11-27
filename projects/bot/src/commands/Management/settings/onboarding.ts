import { renderOnboardingPanel } from '#lib/onboarding/panel';
import { loadOnboardingPanel } from '#lib/onboarding/panelData';
import { RequiresServerSettingsManagement } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/settings onboarding`, see the `settings` parent command.
 *
 * Opens the panel of the onboarding, the stages a new member passes before they are in: their summary with what keeps
 * each from working, this week's counts, and the controls to create, edit, reorder, switch and delete a stage, set the
 * log channel, and post or move the verification message. The dashboard edits the same configuration.
 *
 * @remarks The clicks are handled by the `onboarding` interaction handler, and only the user who ran the command can
 * use the panel. It requires who manages the settings, as `/settings server` does.
 */
@RegisterAsSubcommand('settings', (builder) => applyLocalizedBuilder(builder, 'commands/conf:settingsOnboarding'))
export class UserCommand extends Command {
	@RequiresServerSettingsManagement()
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		// The panel reads Discord (the guild, its onboarding, the message, the roles), which may take longer than Discord waits:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const panel = await loadOnboardingPanel(interaction.guildId, interaction.user.id, t);
		return deferred.update(renderOnboardingPanel({ ...panel, notice: null }));
	}
}
