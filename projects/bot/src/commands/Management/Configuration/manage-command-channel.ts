import { RegisterCommand, container, type Command } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The maximum amount of choices Discord accepts in an autocomplete response.
 */
const MaximumChoices = 25;

/**
 * The parent of the `command-channel` subcommands (`add`, `remove`, `reset` and `show`), which are wired onto this
 * command by `@wolfstar/plugin-subcommands-advanced`.
 *
 * The autocomplete of the `command` option stays on the parent: the plugin routes `chatInputRun` to the children, but
 * autocomplete interactions are dispatched by the name of the top-level command and never reach them.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:manageCommandChannel')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Subcommand {
	public override autocompleteRun(interaction: Command.AutocompleteInteraction, args: Command.AutocompleteArguments<{ command: string }>) {
		if (args.focused !== 'command') return interaction.replyEmpty();

		// The commands are matched by the name of their piece, see `CommandMatcher`:
		const query = (args.command ?? '').toLowerCase();
		const choices = [...container.stores.get('commands').values()]
			.filter((piece) => piece.router.chatInputName !== null && piece.name.toLowerCase().includes(query))
			.slice(0, MaximumChoices)
			.map((piece) => ({ name: piece.name, value: piece.name }));
		return interaction.reply({ choices });
	}
}
