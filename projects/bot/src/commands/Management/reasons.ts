import { getModerationReasonChoices, readModerationReasons } from '#lib/moderation/reasons';
import { ApplyOptions } from '@wolfstar/decorators';
import type { Command } from '@wolfstar/http-framework';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The parent of the `reasons` subcommands (`add`, `remove` and `list`), which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`. They manage the predefined reasons of the server, which the `reason` option
 * of every moderation command takes by their alias, see `lib/moderation/reasons`.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['administrator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/reasons:reasons')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {
	// The autocomplete of the subcommands reaches the parent:
	public override async autocompleteRun(
		interaction: Command.AutocompleteInteraction,
		args: Command.AutocompleteArguments<Pick<Command.OptionsOf<'reasons remove'>, 'alias'>>
	) {
		if (args.focused !== 'alias' || !interaction.guildId) return interaction.replyEmpty();

		const reasons = await readModerationReasons(interaction.guildId);
		return interaction.reply({ choices: getModerationReasonChoices(reasons, args.alias ?? '') });
	}
}
