import { replyModerationReasonAutocomplete } from '#lib/moderation/reasons';
import type { Command } from '@wolfstar/http-framework';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `unrestrict` subcommands (`attachment`, `embed`, `emoji`, `reaction` and `voice`), which live in their own
 * classes next to this file (`unrestrict<Type>.ts`) and are wired onto this command by `@wolfstar/plugin-subcommands-advanced`.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:unrestrict')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
)
export class UserCommand extends Subcommand {
	// The autocomplete of the subcommands reaches the parent, see `replyModerationReasonAutocomplete`:
	public override autocompleteRun(interaction: Command.AutocompleteInteraction, args: Command.AutocompleteArguments<{ reason?: string }>) {
		return replyModerationReasonAutocomplete(interaction, args);
	}
}
