import { getAppealChoices } from '#lib/moderation/appealCommands';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import type { Command } from '@wolfstar/http-framework';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * The subcommands that decide an appeal, for which the autocomplete leaves out the ones that were decided.
 */
const DecisionSubcommands: readonly (string | null)[] = ['approve', 'deny'];

/**
 * The parent of the `appeal` subcommands (`list`, `view`, `approve`, `deny` and `send`), with which the moderators review
 * the appeals the members send from the website, see `lib/moderation/appealService.ts`. They are wired onto this command
 * by `@wolfstar/plugin-subcommands-advanced`.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['appealManager'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:name', 'commands/appeal:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {
	// The autocomplete of the subcommands reaches the parent:
	public override async autocompleteRun(
		interaction: Command.AutocompleteInteraction,
		args: Command.AutocompleteArguments<Pick<Command.OptionsOf<'appeal view'>, 'appeal'>>
	) {
		if (args.focused !== 'appeal' || !interaction.guildId) return interaction.replyEmpty();

		const t = getSupportedUserLanguageT(interaction) as unknown as TFunction<AnyNamespace>;
		const choices = await getAppealChoices(t, interaction.guildId, args.appeal ?? '', DecisionSubcommands.includes(args.subCommand));
		return interaction.reply({ choices });
	}
}
