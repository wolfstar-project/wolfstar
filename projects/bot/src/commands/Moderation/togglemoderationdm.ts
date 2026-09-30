import { createTranslator } from '#lib/structures/commands/utils';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord-api-types/v10';

@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:toggleModerationDm')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));

		const enabled = this.toggleModerationDirectMessageEnabled(interaction.user.id);
		const key =
			enabled === null
				? 'commands/moderation:toggleModerationDmUnavailable'
				: enabled
					? 'commands/moderation:toggleModerationDmToggledEnabled'
					: 'commands/moderation:toggleModerationDmToggledDisabled';
		return interaction.reply({ content: t(key), flags: MessageFlags.Ephemeral });
	}

	/**
	 * Toggles whether the user receives the moderation direct messages.
	 *
	 * @remarks
	 *
	 * The normalized `User` model of the (externally owned) Prisma 8 contract only has the `report` column, the old
	 * `moderation_dm` one is not part of it, and `ModerationCommand.fetchUserModerationDmEnabled` does not read it either.
	 * Until the column exists the preference cannot be persisted, so this returns `null` instead of claiming that it
	 * was toggled. Once it exists, flip it here (`UPDATE ... SET moderation_dm = NOT moderation_dm RETURNING`) and return
	 * the new value.
	 *
	 * @param _userId - The ID of the user to toggle the preference of.
	 * @returns The new value, or `null` if it cannot be stored.
	 */
	private toggleModerationDirectMessageEnabled(_userId: string): boolean | null {
		return null;
	}
}
