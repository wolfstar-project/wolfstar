import { ApplyOptions } from '@wolfstar/decorators';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import type { Command } from '@wolfstar/http-framework';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * Manages the auto-moderation rules of the server.
 *
 * @remarks
 *
 * - A server has as many rules as it wants of each type (up to `MaximumAutoModerationRules` in all), each with its own
 *   name, options, actions and exemptions, see `lib/moderation/automod/rules`.
 * - The `create`, `edit`, `delete`, `list`, `show`, `add`, `remove` and `ignore` subcommands are wired onto this command
 *   by `@wolfstar/plugin-subcommands-advanced`. They take the rule by its name, as a `rule` option with autocomplete.
 * - The autocomplete stays on the parent: the plugin routes `chatInputRun` to the children, but autocomplete
 *   interactions are dispatched by the name of the top-level command and never reach them.
 */
@ApplyOptions<Subcommand.Options>({ preconditions: ['administrator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/auto-moderation:automod')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {
	public override async autocompleteRun(
		interaction: Command.AutocompleteInteraction,
		args: Command.AutocompleteArguments<Pick<Command.OptionsOf<'automod show'>, 'rule'>>
	) {
		if (args.focused !== 'rule' || !interaction.guildId) return interaction.replyEmpty();

		const query = (args.rule ?? '').toLowerCase();
		const rules = await readAutoModerationRules(interaction.guildId);
		const choices = rules
			.filter((rule) => rule.name.toLowerCase().includes(query))
			.slice(0, 25)
			.map((rule) => ({ name: rule.name, value: rule.name }));

		return interaction.reply({ choices });
	}
}
